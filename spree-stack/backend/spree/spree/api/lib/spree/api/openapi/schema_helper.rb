# frozen_string_literal: true

module Spree
  module Api
    module OpenAPI
      # Helper module to reference Typelizer-generated schemas in rswag specs
      module SchemaHelper
        extend self

        # Reference a schema by name (e.g., 'Product', 'Order')
        def ref(schema_name)
          { '$ref' => "#/components/schemas/#{schema_name}" }
        end

        # Paginated response wrapper
        def paginated(schema_name)
          {
            type: :object,
            properties: {
              data: {
                type: :array,
                items: ref(schema_name)
              },
              meta: ref('PaginationMeta')
            },
            required: %w[data meta]
          }
        end

        # Error response schema
        def error_response
          ref('ErrorResponse')
        end

        # Common schemas that are not from serializers
        def common_schemas
          {
            PaginationMeta: {
              type: :object,
              properties: {
                page: { type: :integer, example: 1 },
                limit: { type: :integer, example: 25 },
                count: { type: :integer, example: 100, description: 'Total number of records' },
                pages: { type: :integer, example: 4, description: 'Total number of pages' },
                from: { type: :integer, example: 1, description: 'Index of first record on this page' },
                to: { type: :integer, example: 25, description: 'Index of last record on this page' },
                in: { type: :integer, example: 25, description: 'Number of records on this page' },
                previous: { type: :integer, nullable: true, example: nil, description: 'Previous page number' },
                next: { type: :integer, nullable: true, example: 2, description: 'Next page number' }
              },
              required: %w[page limit count pages from to in]
            },
            ErrorResponse: {
              type: :object,
              properties: {
                error: {
                  type: :object,
                  properties: {
                    code: { type: :string, example: 'record_not_found' },
                    message: { type: :string, example: 'Record not found' },
                    details: {
                      type: :object,
                      description: 'Field-specific validation errors',
                      nullable: true,
                      example: { name: ['is too short', 'is required'], email: ['is invalid'] }
                    }
                  },
                  required: %w[code message]
                }
              },
              required: %w[error],
              example: {
                error: {
                  code: 'validation_error',
                  message: 'Validation failed',
                  details: { name: ['is too short'], email: ['is invalid'] }
                }
              }
            },
            AuthResponse: {
              type: :object,
              properties: {
                token: { type: :string, description: 'JWT access token' },
                refresh_token: { type: :string, description: 'Refresh token for obtaining new access tokens' },
                user: { '$ref' => '#/components/schemas/Customer' }
              },
              required: %w[token refresh_token user]
            },
            CheckoutRequirement: {
              type: :object,
              properties: {
                step: { type: :string, description: 'Checkout step this requirement belongs to', example: 'payment' },
                field: { type: :string, description: 'Field that needs to be satisfied', example: 'payment' },
                message: { type: :string, description: 'Human-readable requirement message', example: 'Add a payment method' }
              },
              required: %w[step field message]
            },
            CartWarning: {
              type: :object,
              description: 'A warning about a cart issue (e.g., item removed due to stock change)',
              properties: {
                code: { type: :string, description: 'Machine-readable warning code', example: 'line_item_removed' },
                message: { type: :string, description: 'Human-readable warning message', example: 'Blue T-Shirt was removed because it was sold out' },
                line_item_id: { type: :string, nullable: true, description: 'Prefixed line item ID (when applicable)', example: 'li_abc123' },
                variant_id: { type: :string, nullable: true, description: 'Prefixed variant ID (when applicable)', example: 'variant_abc123' }
              },
              required: %w[code message]
            },
            FulfillmentManifestItem: {
              type: :object,
              description: 'An item within a fulfillment — which line item and how many units are in this fulfillment',
              properties: {
                item_id: { type: :string, description: 'Line item prefixed ID', example: 'li_abc123' },
                variant_id: { type: :string, description: 'Variant prefixed ID', example: 'variant_abc123' },
                quantity: { type: :integer, description: 'Quantity in this fulfillment', example: 2 }
              },
              required: %w[item_id variant_id quantity]
            }
          }
        end

        # Get all schemas (Typelizer + common)
        def all_schemas
          schemas = common_schemas

          begin
            schemas.merge!(typelizer_schemas)
          rescue StandardError => e
            Rails.logger.warn "Failed to load Typelizer schemas: #{e.message}"
          end

          schemas
        end

        private

        def typelizer_schemas
          with_typelizer_enabled do
            schemas = Typelizer.openapi_schemas(writer_name: :store)
            schemas.each_value do |s|
              s[:'x-typelizer'] = true
              strip_null_from_enums(s)
            end
            patch_cart_schema(schemas)
            patch_fulfillment_schema(schemas)
            schemas
          end
        end

        # Typelizer cannot represent Array<{...}> inline object types in OpenAPI,
        # so we patch them to reference manually-defined component schemas.
        def patch_cart_schema(schemas)
          cart = schemas['Cart'] || schemas[:Cart]
          return unless cart

          props = cart[:properties]
          return unless props

          req_key = props.key?('requirements') ? 'requirements' : :requirements
          if props[req_key]
            props[req_key] = {
              type: :array,
              items: { '$ref' => '#/components/schemas/CheckoutRequirement' }
            }
          end

          warn_key = props.key?('warnings') ? 'warnings' : :warnings
          if props[warn_key]
            props[warn_key] = {
              type: :array,
              items: { '$ref' => '#/components/schemas/CartWarning' }
            }
          end
        end

        # Typelizer cannot represent Array<{...}> inline object types in OpenAPI,
        # so we patch Fulfillment#items to reference the FulfillmentManifestItem component schema.
        def patch_fulfillment_schema(schemas)
          fulfillment = schemas['Fulfillment'] || schemas[:Fulfillment]
          return unless fulfillment

          props = fulfillment[:properties]
          return unless props

          items_key = props.key?('items') ? 'items' : :items
          if props[items_key]
            props[items_key] = {
              type: :array,
              items: { '$ref' => '#/components/schemas/FulfillmentManifestItem' }
            }
          end
        end

        # Typelizer adds nil to enum arrays for nullable fields.
        # OpenAPI 3.0 handles nullability via `nullable: true`, so the nil entry is redundant
        # and causes issues with code generators.
        def strip_null_from_enums(schema)
          properties = schema[:properties] || {}
          properties.each_value do |prop|
            next unless prop.is_a?(Hash) && prop[:enum].is_a?(Array)

            prop[:enum].reject!(&:nil?)
          end
        end

        # Typelizer is normally disabled in test/production, but we need it
        # enabled to generate OpenAPI schemas from serializer type hints
        def with_typelizer_enabled
          original = ENV['DISABLE_TYPELIZER']
          ENV['DISABLE_TYPELIZER'] = 'false'
          yield
        ensure
          ENV['DISABLE_TYPELIZER'] = original
        end
      end
    end
  end
end
