module Spree
  module Api
    module V3
      module Admin
        class PaymentSourceSerializer < V3::PaymentSourceSerializer
          attributes created_at: :iso8601, updated_at: :iso8601
        end
      end
    end
  end
end
