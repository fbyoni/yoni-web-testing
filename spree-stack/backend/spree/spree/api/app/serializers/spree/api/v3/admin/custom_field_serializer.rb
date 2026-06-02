module Spree
  module Api
    module V3
      module Admin
        # Admin API Custom Field Serializer
        # Full custom field data including admin-only fields
        class CustomFieldSerializer < V3::CustomFieldSerializer
          typelize storefront_visible: :boolean

          attributes created_at: :iso8601, updated_at: :iso8601

          attribute :storefront_visible do |metafield|
            metafield.display_on.in?(%w[both front_end])
          end
        end
      end
    end
  end
end
