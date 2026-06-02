require 'spec_helper'

RSpec.describe Spree::Api::V3::Store::AuthController, type: :controller do
  render_views

  include_context 'API v3 Store'

  before do
    request.headers['X-Spree-Api-Key'] = api_key.token
  end

  describe 'POST #create (login)' do
    let!(:existing_user) { create(:user, password: 'password123', password_confirmation: 'password123') }

    it 'authenticates with email and password' do
      post :create, params: { provider: 'email', email: existing_user.email, password: 'password123' }

      expect(response).to have_http_status(:ok)
      expect(json_response['token']).to be_present
    end

    it 'returns a refresh token on login' do
      post :create, params: { provider: 'email', email: existing_user.email, password: 'password123' }

      expect(response).to have_http_status(:ok)
      expect(json_response['refresh_token']).to be_present
    end

    it 'creates a RefreshToken record' do
      expect {
        post :create, params: { provider: 'email', email: existing_user.email, password: 'password123' }
      }.to change(Spree::RefreshToken, :count).by(1)
    end

    it 'returns user data on successful login' do
      post :create, params: { provider: 'email', email: existing_user.email, password: 'password123' }

      expect(json_response['user']).to be_present
      expect(json_response['user']['email']).to eq(existing_user.email)
    end

    context 'invalid credentials' do
      it 'returns unauthorized for wrong password' do
        post :create, params: { provider: 'email', email: existing_user.email, password: 'wrong' }

        expect(response).to have_http_status(:unauthorized)
        expect(json_response['error']['code']).to eq('authentication_failed')
      end

      it 'returns unauthorized for non-existent email' do
        post :create, params: { provider: 'email', email: 'nonexistent@example.com', password: 'password123' }

        expect(response).to have_http_status(:unauthorized)
        expect(json_response['error']['code']).to eq('authentication_failed')
      end

      it 'returns unauthorized for missing email' do
        post :create, params: { provider: 'email', password: 'password123' }

        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns unauthorized for missing password' do
        post :create, params: { provider: 'email', email: existing_user.email }

        expect(response).to have_http_status(:unauthorized)
      end

      it 'does not create a RefreshToken on failure' do
        expect {
          post :create, params: { provider: 'email', email: existing_user.email, password: 'wrong' }
        }.not_to change(Spree::RefreshToken, :count)
      end
    end

    context 'without API key' do
      before { request.headers['X-Spree-Api-Key'] = nil }

      it 'returns unauthorized' do
        post :create, params: { provider: 'email', email: existing_user.email, password: 'password123' }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe 'POST #refresh' do
    let!(:existing_user) { create(:user, password: 'password123', password_confirmation: 'password123') }
    let!(:refresh_token) { Spree::RefreshToken.create_for(existing_user) }

    it 'returns a new access token and rotated refresh token' do
      post :refresh, params: { refresh_token: refresh_token.token }

      expect(response).to have_http_status(:ok)
      expect(json_response['token']).to be_present
      expect(json_response['refresh_token']).to be_present
      # Refresh token should be rotated (different from original)
      expect(json_response['refresh_token']).not_to eq(refresh_token.token)
    end

    it 'returns user data' do
      post :refresh, params: { refresh_token: refresh_token.token }

      expect(json_response['user']).to be_present
      expect(json_response['user']['email']).to eq(existing_user.email)
    end

    it 'destroys the old refresh token' do
      post :refresh, params: { refresh_token: refresh_token.token }

      expect(Spree::RefreshToken.find_by(id: refresh_token.id)).to be_nil
    end

    it 'creates a new refresh token' do
      expect {
        post :refresh, params: { refresh_token: refresh_token.token }
      }.not_to change(Spree::RefreshToken, :count) # one destroyed, one created
    end

    context 'without refresh_token param' do
      it 'returns unauthorized' do
        post :refresh

        expect(response).to have_http_status(:unauthorized)
        expect(json_response['error']['code']).to eq('invalid_refresh_token')
      end
    end

    context 'with invalid refresh token' do
      it 'returns unauthorized' do
        post :refresh, params: { refresh_token: 'invalid_token' }

        expect(response).to have_http_status(:unauthorized)
        expect(json_response['error']['code']).to eq('invalid_refresh_token')
      end
    end

    context 'with expired refresh token' do
      before { refresh_token.update_column(:expires_at, 1.day.ago) }

      it 'returns unauthorized' do
        post :refresh, params: { refresh_token: refresh_token.token }

        expect(response).to have_http_status(:unauthorized)
        expect(json_response['error']['code']).to eq('invalid_refresh_token')
      end
    end
  end

  describe 'POST #logout' do
    let!(:existing_user) { create(:user, password: 'password123', password_confirmation: 'password123') }
    let!(:refresh_token) { Spree::RefreshToken.create_for(existing_user) }

    it 'revokes the refresh token' do
      expect {
        post :logout, params: { refresh_token: refresh_token.token }
      }.to change(Spree::RefreshToken, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end

    it 'succeeds even with invalid refresh token' do
      post :logout, params: { refresh_token: 'nonexistent' }

      expect(response).to have_http_status(:no_content)
    end

    it 'succeeds without refresh token param' do
      post :logout

      expect(response).to have_http_status(:no_content)
    end
  end
end
