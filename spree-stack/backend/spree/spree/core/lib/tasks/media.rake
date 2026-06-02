namespace :spree do
  namespace :media do
    desc 'Backfill primary_media_id for all variants and products'
    task backfill_primary_media: :environment do
      puts 'Backfilling variant primary_media...'
      Spree::Variant.where(primary_media_id: nil).where.not(media_count: 0).find_each do |variant|
        first_media = variant.gallery_media.first
        variant.update_column(:primary_media_id, first_media.id) if first_media
      end

      puts 'Backfilling product primary_media...'
      Spree::Product.where(primary_media_id: nil).where.not(media_count: 0).find_each do |product|
        first_media = product.gallery_media.first
        product.update_column(:primary_media_id, first_media.id) if first_media
      end

      puts 'Done!'
    end
  end
end
