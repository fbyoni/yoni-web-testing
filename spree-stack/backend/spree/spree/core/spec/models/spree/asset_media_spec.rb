require 'spec_helper'

RSpec.describe 'Product media system', type: :model do
  describe 'Spree::Asset' do
    describe '#focal_point' do
      let(:asset) { build(:asset, focal_point_x: 0.5, focal_point_y: 0.3) }

      it 'returns hash with x and y' do
        expect(asset.focal_point).to eq({ x: 0.5, y: 0.3 })
      end

      it 'returns nil when coordinates are not set' do
        asset.focal_point_x = nil
        expect(asset.focal_point).to be_nil
      end
    end

    describe '#focal_point=' do
      let(:asset) { build(:asset) }

      it 'sets x and y from hash' do
        asset.focal_point = { x: 0.25, y: 0.75 }
        expect(asset.focal_point_x).to eq(0.25)
        expect(asset.focal_point_y).to eq(0.75)
      end

      it 'clears focal point when set to nil' do
        asset.focal_point = { x: 0.5, y: 0.5 }
        asset.focal_point = nil
        expect(asset.focal_point_x).to be_nil
        expect(asset.focal_point_y).to be_nil
      end
    end

    describe '#product' do
      it 'returns product when viewable is a Product' do
        product = create(:product)
        asset = create(:image, viewable: product)
        expect(asset.product).to eq(product)
      end
    end

    describe 'media_type validation' do
      it 'accepts valid media types' do
        %w[image video external_video].each do |type|
          asset = build(:asset, media_type: type)
          asset.valid?
          expect(asset.errors[:media_type]).to be_empty
        end
      end

      it 'rejects invalid media types' do
        asset = build(:asset, media_type: 'audio')
        expect(asset).not_to be_valid
        expect(asset.errors[:media_type]).to be_present
      end

      it 'defaults to image' do
        asset = Spree::Asset.new
        expect(asset.media_type).to eq('image')
      end

      it 'defaults to image for Spree::Image subclass' do
        image = Spree::Image.new
        expect(image.media_type).to eq('image')
      end
    end

    describe 'counter caches with product viewable' do
      let(:product) { create(:product) }

      it 'increments media_count on product when image is created' do
        expect {
          create(:image, viewable: product)
        }.to change { product.reload.media_count }.by(1)
      end

      it 'decrements media_count on product when image is destroyed' do
        image = create(:image, viewable: product)
        expect {
          image.destroy
        }.to change { product.reload.media_count }.by(-1)
      end
    end

    describe 'thumbnail updates with product viewable' do
      let(:product) { create(:product) }

      it 'sets product primary_media_id when image is created' do
        image = create(:image, viewable: product)
        expect(product.reload.primary_media_id).to eq(image.id)
      end

      it 'clears product primary_media_id when last image is destroyed' do
        image = create(:image, viewable: product)
        image.destroy
        expect(product.reload.primary_media_id).to be_nil
      end
    end
  end

  describe 'Spree::Product' do
    let(:product) { create(:product) }

    describe '#media' do
      it 'returns product-level assets' do
        image = create(:image, viewable: product)
        expect(product.media).to include(image)
      end

      it 'does not include variant images' do
        variant_image = create(:image, viewable: product.master)
        expect(product.media).not_to include(variant_image)
      end

      it 'is ordered by position' do
        img2 = create(:image, viewable: product, position: 2)
        img1 = create(:image, viewable: product, position: 1)
        expect(product.media.to_a).to eq([img1, img2])
      end
    end

    describe '#gallery_media' do
      it 'returns product media when present' do
        product_image = create(:image, viewable: product)
        create(:image, viewable: product.master) # variant image
        expect(product.reload.gallery_media).to include(product_image)
      end

      it 'falls back to variant_images when no product media' do
        variant_image = create(:image, viewable: product.master)
        expect(product.reload.gallery_media).to include(variant_image)
      end
    end

    describe '#update_thumbnail!' do
      it 'uses product media first' do
        product_image = create(:image, viewable: product)
        expect(product.reload.primary_media_id).to eq(product_image.id)
      end

      it 'falls back to variant images when no product media' do
        variant_image = create(:image, viewable: product.master)
        product.update_thumbnail!
        expect(product.reload.primary_media_id).to eq(variant_image.id)
      end
    end
  end

  describe 'Spree::Variant' do
    let(:product) { create(:product) }
    let(:variant) { create(:variant, product: product) }

    describe '#gallery_media' do
      it 'returns direct images' do
        direct_image = create(:image, viewable: variant)
        expect(variant.gallery_media).to include(direct_image)
      end
    end
  end
end
