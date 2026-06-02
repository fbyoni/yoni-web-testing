# coding: utf-8
lib = File.expand_path('../lib/', __FILE__)
$LOAD_PATH.unshift lib unless $LOAD_PATH.include?(lib)

require 'spree_i18n/version'

Gem::Specification.new do |s|
  s.platform    = Gem::Platform::RUBY
  s.name        = 'spree_i18n'
  s.version     = SpreeI18n.version
  s.summary     = 'Provides locale information for use in Spree.'
  s.description = s.summary

  s.author      = 'Sean Schofield'
  s.email       = 'sean.schofield@gmail.com'
  s.homepage    = 'http://spreecommerce.com'
  s.license     = 'BSD-3'

  # Vendored from source without a .git dir; use a glob instead of `git ls-files`
  # so the gemspec evaluates at runtime (the image has no git binary).
  s.files        = Dir["{app,bin,config,db,lib,vendor}/**/*", "LICENSE.md", "Rakefile", "README.md"]
  s.test_files   = Dir["spec/**/*"]
  s.require_path = 'lib'
  s.requirements << 'none'

  s.add_runtime_dependency 'i18n_data'
  s.add_runtime_dependency 'rails-i18n'
  s.add_runtime_dependency 'kaminari-i18n'
  s.add_runtime_dependency 'spree_core', '>= 4.2.0.rc3'
  s.add_runtime_dependency 'spree_extension'

  s.add_development_dependency 'spree_dev_tools'
end
