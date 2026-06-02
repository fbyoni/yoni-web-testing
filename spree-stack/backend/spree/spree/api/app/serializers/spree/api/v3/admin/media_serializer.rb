module Spree
  module Api
    module V3
      module Admin
        class MediaSerializer < V3::MediaSerializer
          typelize viewable_type: :string, viewable_id: :string

          attributes created_at: :iso8601, updated_at: :iso8601

          attribute :viewable_id do |asset|
            asset.viewable&.prefixed_id
          end

          attributes :viewable_type
        end
      end
    end
  end
end
