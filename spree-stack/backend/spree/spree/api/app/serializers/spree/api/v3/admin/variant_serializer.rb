module Spree
  module Api
    module V3
      module Admin
        # Admin API Variant Serializer
        # Full variant data including admin-only fields
        class VariantSerializer < V3::VariantSerializer

          # Additional type hints for admin-only attributes
          typelize position: :number, tax_category_id: [:string, nullable: true],
                   cost_price: [:string, nullable: true], cost_currency: [:string, nullable: true],
                   total_on_hand: [:number, nullable: true],
                   deleted_at: [:string, nullable: true]

          # Admin-only attributes
          attributes :position, :total_on_hand, :tax_category_id, :cost_price, :cost_currency, deleted_at: :iso8601,
                     created_at: :iso8601, updated_at: :iso8601

          # Override inherited associations to use admin serializers
          one :primary_media,
              resource: Spree.api.admin_media_serializer,
              if: proc { expand?('primary_media') }

          many :gallery_media,
               key: :media,
               resource: Spree.api.admin_media_serializer,
               if: proc { expand?('media') }

          many :option_values, resource: Spree.api.admin_option_value_serializer

          # All prices for this variant (for admin management)
          many :prices,
               resource: Spree.api.admin_price_serializer,
               if: proc { expand?('prices') }

          many :metafields,
               key: :custom_fields,
               resource: Spree.api.admin_custom_field_serializer,
               if: proc { expand?('custom_fields') }
        end
      end
    end
  end
end
