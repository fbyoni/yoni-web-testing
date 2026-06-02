module Spree
  module Searchable
    extend ActiveSupport::Concern

    included do
      def self.sanitize_query_for_search(query)
        ActiveRecord::Base.sanitize_sql_like(query.to_s.downcase.strip)
      end

      def self.search_condition(model_class, attribute, query)
        encrypted_attributes = model_class.encrypted_attributes.presence || []

        if encrypted_attributes.include?(attribute.to_sym)
          model_class.arel_table[attribute.to_sym].eq(query)
        else
          model_class.arel_table[attribute.to_sym].lower.matches("%#{query}%")
        end
      end

      # Backward compatibility aliases — remove in Spree 6.0
      def self.sanitize_query_for_multi_search(query) = sanitize_query_for_search(query)
      def self.multi_search_condition(model_class, attribute, query) = search_condition(model_class, attribute, query)
    end
  end

  # Backward compatibility alias — remove in Spree 6.0
  MultiSearchable = Searchable
end
