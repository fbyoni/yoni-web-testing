module Spree
  module Api
    module V3
      # Unified discount serializer for applied promotions on Cart and Order.
      # Replaces CartPromotionSerializer and OrderPromotionSerializer.
      class DiscountSerializer < BaseSerializer
        typelize name: :string, description: [:string, nullable: true], code: [:string, nullable: true],
                 amount: :string, display_amount: :string, promotion_id: :string

        attribute :promotion_id do |record|
          record.promotion&.prefixed_id
        end

        attributes :name, :description, :code, :amount, :display_amount
      end
    end
  end
end
