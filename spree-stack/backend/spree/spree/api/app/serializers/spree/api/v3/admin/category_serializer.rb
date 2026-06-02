module Spree
  module Api
    module V3
      module Admin
        # Admin API Category Serializer
        # Full category data including admin-only fields
        class CategorySerializer < V3::CategorySerializer
          typelize lft: :number, rgt: :number

          # Nested set columns for tree operations
          attributes :lft, :rgt, created_at: :iso8601, updated_at: :iso8601

          # Override inherited associations to use admin serializers
          one :parent,
              resource: Spree.api.admin_category_serializer,
              if: proc { expand?('parent') }

          many :children,
               resource: Spree.api.admin_category_serializer,
               if: proc { expand?('children') }

          many :ancestors,
               resource: Spree.api.admin_category_serializer,
               if: proc { expand?('ancestors') }

          many :metafields,
               key: :custom_fields,
               resource: Spree.api.admin_custom_field_serializer,
               if: proc { expand?('custom_fields') }
        end
      end
    end
  end
end
