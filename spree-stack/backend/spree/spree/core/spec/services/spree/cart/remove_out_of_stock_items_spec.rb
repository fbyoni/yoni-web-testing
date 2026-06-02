require 'spec_helper'

RSpec.describe Spree::Cart::RemoveOutOfStockItems do
  subject { described_class }

  let(:store) { @default_store }
  let(:user) { create(:user) }
  let(:order) { create(:order_with_totals, store: store, user: user) }
  let(:product) { order.products.first }
  let(:variant) { order.variants.first }
  let(:execute) { subject.call(order: order) }

  it 'evaluate service to success' do
    expect(execute).to be_success
  end

  it 'returns empty messages and warnings when cart is valid' do
    _order, messages, warnings = execute.value
    expect(messages).to be_empty
    expect(warnings).to be_empty
  end

  context 'when product is archived' do
    before { product.update_columns(status: 'archive') }

    it 'removes line item and returns discontinued message' do
      _order, messages, _warnings = execute.value
      expect(messages.to_sentence).to eq(Spree.t('cart_line_item.discontinued', li_name: product.name))
    end

    it 'returns structured warning with line_item_removed code' do
      _order, _messages, warnings = execute.value
      expect(warnings.length).to eq(1)
      expect(warnings.first[:code]).to eq('line_item_removed')
      expect(warnings.first[:variant_id]).to be_present
    end
  end

  context 'when product is out of stock' do
    before { product.stock_items.update_all(count_on_hand: 0, backorderable: false) }

    it 'removes line item and returns out of stock message' do
      _order, messages, _warnings = execute.value
      expect(messages.to_sentence).to eq(Spree.t('cart_line_item.out_of_stock', li_name: product.name))
    end

    it 'returns structured warning with line_item_removed code' do
      _order, _messages, warnings = execute.value
      expect(warnings.length).to eq(1)
      expect(warnings.first[:code]).to eq('line_item_removed')
    end
  end

  context 'when product is deleted' do
    before { product.delete }

    it 'removes line item and returns discontinued message' do
      _order, messages, _warnings = execute.value
      expect(messages.to_sentence).to eq(Spree.t('cart_line_item.discontinued', li_name: product.name))
    end
  end

  context 'when product is discontinued' do
    before { product.update_columns(status: 'discontinued') }

    it 'removes line item and returns discontinued message' do
      _order, messages, _warnings = execute.value
      expect(messages.to_sentence).to eq(Spree.t('cart_line_item.discontinued', li_name: product.name))
    end
  end

  context 'when variant is discontinued' do
    before { variant.discontinue! }

    it 'removes line item and returns discontinued message' do
      _order, messages, _warnings = execute.value
      expect(messages.to_sentence).to eq(Spree.t('cart_line_item.discontinued', li_name: variant.product.name))
    end
  end
end
