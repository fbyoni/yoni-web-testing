# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Admin
        class AllowedOriginSerializer < V3::BaseSerializer
          typelize store_id: :string

          attributes :id, :origin, created_at: :iso8601, updated_at: :iso8601

          attribute :store_id do |allowed_origin|
            allowed_origin.store&.prefixed_id
          end
        end
      end
    end
  end
end
