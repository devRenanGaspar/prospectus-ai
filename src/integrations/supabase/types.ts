export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          handled_at: string | null
          handled_by: string | null
          id: string
          notes: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_impersonation_logs: {
        Row: {
          admin_id: string
          id: string
          ip_address: string | null
          outcome: string
          started_at: string
          target_email: string | null
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          id?: string
          ip_address?: string | null
          outcome?: string
          started_at?: string
          target_email?: string | null
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          id?: string
          ip_address?: string | null
          outcome?: string
          started_at?: string
          target_email?: string | null
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_password_reset_logs: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          ip_address: string | null
          outcome: string
          target_email: string | null
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          outcome?: string
          target_email?: string | null
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          outcome?: string
          target_email?: string | null
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: boolean
          maintenance_message: string | null
          maintenance_mode: string
          maintenance_started_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: string
          maintenance_started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: string
          maintenance_started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      copy_quality_daily: {
        Row: {
          captured_at: string
          check_name: string
          falhas_24h: number
          falhas_total: number
          id: number
          severity: string
          test_id: string
          universo_24h: number
          universo_total: number
        }
        Insert: {
          captured_at?: string
          check_name: string
          falhas_24h: number
          falhas_total: number
          id?: never
          severity: string
          test_id: string
          universo_24h: number
          universo_total: number
        }
        Update: {
          captured_at?: string
          check_name?: string
          falhas_24h?: number
          falhas_total?: number
          id?: never
          severity?: string
          test_id?: string
          universo_24h?: number
          universo_total?: number
        }
        Relationships: []
      }
      copy_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lead_ids: string[]
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_ids: string[]
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_ids?: string[]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_costs: {
        Row: {
          action_name: string
          cost: number
          created_at: string
          id: string
        }
        Insert: {
          action_name: string
          cost: number
          created_at?: string
          id?: string
        }
        Update: {
          action_name?: string
          cost?: number
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          created_at: string
          credits: number
          id: string
          is_active: boolean
          payment_link: string | null
          price: number
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          payment_link?: string | null
          price: number
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          payment_link?: string | null
          price?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      lead_comments: {
        Row: {
          author_name: string
          commented_at: string
          content: string
          created_at: string
          id: string
          lead_id: string
          rating: number | null
        }
        Insert: {
          author_name: string
          commented_at: string
          content: string
          created_at?: string
          id?: string
          lead_id: string
          rating?: number | null
        }
        Update: {
          author_name?: string
          commented_at?: string
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          rating?: number | null
        }
        Relationships: []
      }
      lead_searches: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          leads_found: number
          limit_per_niche: number
          quantity_requested: number
          refunded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          leads_found?: number
          limit_per_niche?: number
          quantity_requested: number
          refunded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          leads_found?: number
          limit_per_niche?: number
          quantity_requested?: number
          refunded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_agent_enabled: boolean
          ai_generated_copy: string | null
          assigned_user_id: string | null
          category_name: string | null
          city: string | null
          cnpj: string | null
          cnpj_alternativo: string | null
          company_name: string | null
          contact_info: Json | null
          country: string | null
          created_at: string
          google_place_id: string | null
          id: string
          image_url: string | null
          images_count: string | null
          instagram: string | null
          instagram_alternativo: string | null
          last_message_at: string | null
          lead_replied: string | null
          lead_reply_score: string | null
          mensagem_abordagem_comercial: string | null
          name: string
          neighborhood: string | null
          phone: string | null
          rank: string | null
          reviews_count: string | null
          search_id: string | null
          send_claimed_at: string | null
          source: string | null
          state: string | null
          status: string
          total_score: string | null
          updated_at: string
          user_id: string | null
          website: string | null
          website_analysis: string | null
          whatsapp_alternativo: string | null
          whatsapp_do_site: string | null
        }
        Insert: {
          ai_agent_enabled?: boolean
          ai_generated_copy?: string | null
          assigned_user_id?: string | null
          category_name?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_alternativo?: string | null
          company_name?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          images_count?: string | null
          instagram?: string | null
          instagram_alternativo?: string | null
          last_message_at?: string | null
          lead_replied?: string | null
          lead_reply_score?: string | null
          mensagem_abordagem_comercial?: string | null
          name: string
          neighborhood?: string | null
          phone?: string | null
          rank?: string | null
          reviews_count?: string | null
          search_id?: string | null
          send_claimed_at?: string | null
          source?: string | null
          state?: string | null
          status?: string
          total_score?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
          website_analysis?: string | null
          whatsapp_alternativo?: string | null
          whatsapp_do_site?: string | null
        }
        Update: {
          ai_agent_enabled?: boolean
          ai_generated_copy?: string | null
          assigned_user_id?: string | null
          category_name?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_alternativo?: string | null
          company_name?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          images_count?: string | null
          instagram?: string | null
          instagram_alternativo?: string | null
          last_message_at?: string | null
          lead_replied?: string | null
          lead_reply_score?: string | null
          mensagem_abordagem_comercial?: string | null
          name?: string
          neighborhood?: string | null
          phone?: string | null
          rank?: string | null
          reviews_count?: string | null
          search_id?: string | null
          send_claimed_at?: string | null
          source?: string | null
          state?: string | null
          status?: string
          total_score?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
          website_analysis?: string | null
          whatsapp_alternativo?: string | null
          whatsapp_do_site?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "ops_stuck_searches"
            referencedColumns: ["search_id"]
          },
          {
            foreignKeyName: "leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_reserve: {
        Row: {
          ai_agent_enabled: boolean
          ai_generated_copy: string | null
          assigned_user_id: string | null
          category_name: string | null
          city: string | null
          cnpj: string | null
          cnpj_alternativo: string | null
          company_name: string | null
          contact_info: Json | null
          country: string | null
          created_at: string
          google_place_id: string | null
          id: string
          image_url: string | null
          images_count: string | null
          instagram: string | null
          instagram_alternativo: string | null
          last_message_at: string | null
          lead_replied: string | null
          lead_reply_score: string | null
          mensagem_abordagem_comercial: string | null
          name: string
          neighborhood: string | null
          phone: string | null
          rank: string | null
          reviews_count: string | null
          search_id: string | null
          source: string | null
          state: string | null
          status: string
          total_score: string | null
          updated_at: string
          user_id: string | null
          website: string | null
          website_analysis: string | null
          whatsapp_alternativo: string | null
          whatsapp_do_site: string | null
        }
        Insert: {
          ai_agent_enabled?: boolean
          ai_generated_copy?: string | null
          assigned_user_id?: string | null
          category_name?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_alternativo?: string | null
          company_name?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          images_count?: string | null
          instagram?: string | null
          instagram_alternativo?: string | null
          last_message_at?: string | null
          lead_replied?: string | null
          lead_reply_score?: string | null
          mensagem_abordagem_comercial?: string | null
          name: string
          neighborhood?: string | null
          phone?: string | null
          rank?: string | null
          reviews_count?: string | null
          search_id?: string | null
          source?: string | null
          state?: string | null
          status?: string
          total_score?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
          website_analysis?: string | null
          whatsapp_alternativo?: string | null
          whatsapp_do_site?: string | null
        }
        Update: {
          ai_agent_enabled?: boolean
          ai_generated_copy?: string | null
          assigned_user_id?: string | null
          category_name?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_alternativo?: string | null
          company_name?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          images_count?: string | null
          instagram?: string | null
          instagram_alternativo?: string | null
          last_message_at?: string | null
          lead_replied?: string | null
          lead_reply_score?: string | null
          mensagem_abordagem_comercial?: string | null
          name?: string
          neighborhood?: string | null
          phone?: string | null
          rank?: string | null
          reviews_count?: string | null
          search_id?: string | null
          source?: string | null
          state?: string | null
          status?: string
          total_score?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
          website_analysis?: string | null
          whatsapp_alternativo?: string | null
          whatsapp_do_site?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          external_message_id: string | null
          id: string
          lead_id: string
          sender: string
          timestamp: string
        }
        Insert: {
          content: string
          external_message_id?: string | null
          id?: string
          lead_id: string
          sender: string
          timestamp?: string
        }
        Update: {
          content?: string
          external_message_id?: string | null
          id?: string
          lead_id?: string
          sender?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ops_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      n8n_webhooks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          type: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          type: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          type?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "n8n_webhooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_options: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lead_category: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_category?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_category?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      operation_runs: {
        Row: {
          attempt_count: number
          attributes: Json
          completed_at: string | null
          correlation_id: string
          dispatched_at: string | null
          id: number
          last_error_code: string | null
          operation_type: string
          request_id: string | null
          session_id: string | null
          source: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          attributes?: Json
          completed_at?: string | null
          correlation_id: string
          dispatched_at?: string | null
          id?: never
          last_error_code?: string | null
          operation_type: string
          request_id?: string | null
          session_id?: string | null
          source: string
          started_at: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          attributes?: Json
          completed_at?: string | null
          correlation_id?: string
          dispatched_at?: string | null
          id?: never
          last_error_code?: string | null
          operation_type?: string
          request_id?: string | null
          session_id?: string | null
          source?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      operational_events: {
        Row: {
          attributes: Json
          correlation_id: string | null
          duration_ms: number | null
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          event_id: string
          event_name: string
          event_version: number
          id: number
          occurred_at: string
          operation_type: string | null
          received_at: string
          request_id: string | null
          route_key: string | null
          session_id: string | null
          source: string
          status: string | null
        }
        Insert: {
          attributes?: Json
          correlation_id?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          event_id?: string
          event_name: string
          event_version?: number
          id?: never
          occurred_at?: string
          operation_type?: string | null
          received_at?: string
          request_id?: string | null
          route_key?: string | null
          session_id?: string | null
          source: string
          status?: string | null
        }
        Update: {
          attributes?: Json
          correlation_id?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          event_id?: string
          event_name?: string
          event_version?: number
          id?: never
          occurred_at?: string
          operation_type?: string | null
          received_at?: string
          request_id?: string | null
          route_key?: string | null
          session_id?: string | null
          source?: string
          status?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          credits_included: number
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          payment_link: string | null
          price_monthly: number
        }
        Insert: {
          created_at?: string
          credits_included: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          payment_link?: string | null
          price_monthly: number
        }
        Update: {
          created_at?: string
          credits_included?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          payment_link?: string | null
          price_monthly?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agency_name: string
          business_type: Database["public"]["Enums"]["business_type"]
          context_faq: Json | null
          context_icp: Json | null
          context_persona: string | null
          context_qualification: Json | null
          created_at: string
          credits_balance: number
          email: string | null
          full_name: string | null
          google_calendar_connected_at: string | null
          google_calendar_email: string | null
          id: string
          lgpd_consents: Json
          lgpd_consents_updated_at: string | null
          n8n_workflow_id: string | null
          onboarding_completed: boolean
          owner_name: string | null
          plan_id: string | null
          prompt_abordagem: string | null
          prompt_sdr: string | null
          role: string
          sdr_availability: Json | null
          sdr_name: string | null
          sdr_phone: string | null
          whatsapp_number: string | null
          whatsapp_number_last: string | null
          whatsapp_photo: string | null
          whatsapp_status: string
        }
        Insert: {
          agency_name?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          context_faq?: Json | null
          context_icp?: Json | null
          context_persona?: string | null
          context_qualification?: Json | null
          created_at?: string
          credits_balance?: number
          email?: string | null
          full_name?: string | null
          google_calendar_connected_at?: string | null
          google_calendar_email?: string | null
          id: string
          lgpd_consents?: Json
          lgpd_consents_updated_at?: string | null
          n8n_workflow_id?: string | null
          onboarding_completed?: boolean
          owner_name?: string | null
          plan_id?: string | null
          prompt_abordagem?: string | null
          prompt_sdr?: string | null
          role?: string
          sdr_availability?: Json | null
          sdr_name?: string | null
          sdr_phone?: string | null
          whatsapp_number?: string | null
          whatsapp_number_last?: string | null
          whatsapp_photo?: string | null
          whatsapp_status?: string
        }
        Update: {
          agency_name?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          context_faq?: Json | null
          context_icp?: Json | null
          context_persona?: string | null
          context_qualification?: Json | null
          created_at?: string
          credits_balance?: number
          email?: string | null
          full_name?: string | null
          google_calendar_connected_at?: string | null
          google_calendar_email?: string | null
          id?: string
          lgpd_consents?: Json
          lgpd_consents_updated_at?: string | null
          n8n_workflow_id?: string | null
          onboarding_completed?: boolean
          owner_name?: string | null
          plan_id?: string | null
          prompt_abordagem?: string | null
          prompt_sdr?: string | null
          role?: string
          sdr_availability?: Json | null
          sdr_name?: string | null
          sdr_phone?: string | null
          whatsapp_number?: string | null
          whatsapp_number_last?: string | null
          whatsapp_photo?: string | null
          whatsapp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_metric_snapshots: {
        Row: {
          attributes: Json
          captured_at: string
          correlation_id: string | null
          failed_count: number
          id: number
          oldest_age_seconds: number | null
          processing_count: number
          queue_depth: number
          queue_name: string
          source: string
        }
        Insert: {
          attributes?: Json
          captured_at?: string
          correlation_id?: string | null
          failed_count?: number
          id?: never
          oldest_age_seconds?: number | null
          processing_count?: number
          queue_depth: number
          queue_name: string
          source: string
        }
        Update: {
          attributes?: Json
          captured_at?: string
          correlation_id?: string | null
          failed_count?: number
          id?: never
          oldest_age_seconds?: number | null
          processing_count?: number
          queue_depth?: number
          queue_name?: string
          source?: string
        }
        Relationships: []
      }
      send_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lead_ids: string[]
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_ids: string[]
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_ids?: string[]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          cap_limit: number | null
          created_at: string
          credits_applied: number | null
          credits_capped: number | null
          credits_requested: number | null
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string
          period_end: string | null
          period_start: string | null
          plan_id: string | null
          raw_payload: Json | null
          source: string
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          cap_limit?: number | null
          created_at?: string
          credits_applied?: number | null
          credits_capped?: number | null
          credits_requested?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          cap_limit?: number | null
          created_at?: string
          credits_applied?: number | null
          credits_capped?: number | null
          credits_requested?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string | null
          provider_subscription_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: string | null
          provider_subscription_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_subscription_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_health_hourly: {
        Row: {
          avg_operations_active: number
          avg_queue_depth: number | null
          avg_stuck_total: number
          avg_telemetry_errors_24h: number
          bucket_at: string
          max_operations_active: number
          max_queue_depth: number | null
          max_stuck_total: number
          max_telemetry_errors_24h: number
          rolled_up_at: string
          samples_count: number
        }
        Insert: {
          avg_operations_active: number
          avg_queue_depth?: number | null
          avg_stuck_total: number
          avg_telemetry_errors_24h: number
          bucket_at: string
          max_operations_active: number
          max_queue_depth?: number | null
          max_stuck_total: number
          max_telemetry_errors_24h: number
          rolled_up_at?: string
          samples_count: number
        }
        Update: {
          avg_operations_active?: number
          avg_queue_depth?: number | null
          avg_stuck_total?: number
          avg_telemetry_errors_24h?: number
          bucket_at?: string
          max_operations_active?: number
          max_queue_depth?: number | null
          max_stuck_total?: number
          max_telemetry_errors_24h?: number
          rolled_up_at?: string
          samples_count?: number
        }
        Relationships: []
      }
      system_health_snapshots: {
        Row: {
          captured_at: string
          copy_pending_leads: number
          frontend_errors_24h: number
          id: number
          operations_active: number
          operations_failed: number
          operations_processing: number
          operations_queued: number
          queue_depth: number | null
          queue_snapshot_count: number
          send_pending_leads: number
          stuck_copy_requests: number
          stuck_leads: number
          stuck_searches: number
          telemetry_errors_24h: number
          telemetry_events_24h: number
          web_vitals_24h: number
        }
        Insert: {
          captured_at?: string
          copy_pending_leads: number
          frontend_errors_24h: number
          id?: never
          operations_active: number
          operations_failed: number
          operations_processing: number
          operations_queued: number
          queue_depth?: number | null
          queue_snapshot_count: number
          send_pending_leads: number
          stuck_copy_requests: number
          stuck_leads: number
          stuck_searches: number
          telemetry_errors_24h: number
          telemetry_events_24h: number
          web_vitals_24h: number
        }
        Update: {
          captured_at?: string
          copy_pending_leads?: number
          frontend_errors_24h?: number
          id?: never
          operations_active?: number
          operations_failed?: number
          operations_processing?: number
          operations_queued?: number
          queue_depth?: number | null
          queue_snapshot_count?: number
          send_pending_leads?: number
          stuck_copy_requests?: number
          stuck_leads?: number
          stuck_searches?: number
          telemetry_errors_24h?: number
          telemetry_events_24h?: number
          web_vitals_24h?: number
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action_name: string
          cost: number
          id: string
          lead_id: string | null
          metadata: Json | null
          phone: string | null
          timestamp: string
          user_id: string
        }
        Insert: {
          action_name: string
          cost: number
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          phone?: string | null
          timestamp?: string
          user_id: string
        }
        Update: {
          action_name?: string
          cost?: number
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          phone?: string | null
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ops_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_google_tokens: {
        Row: {
          created_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          timeout_seconds: number
          type: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          timeout_seconds?: number
          type: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          timeout_seconds?: number
          type?: string
          url?: string
        }
        Relationships: []
      }
      whatsapp_connection_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          phone: string | null
          previous_phone: string | null
          previous_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          phone?: string | null
          previous_phone?: string | null
          previous_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          phone?: string | null
          previous_phone?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ops_copy_quality: {
        Row: {
          check_name: string | null
          context: Json | null
          lead_id: string | null
          severity: string | null
          test_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      ops_double_sends: {
        Row: {
          cobrancas: number | null
          lead_id: string | null
          primeira: string | null
          ultima: string | null
        }
        Relationships: []
      }
      ops_duplicate_lead_phones: {
        Row: {
          com_agente_ligado: number | null
          lead_vencedor: string | null
          leads_no_mesmo_telefone: number | null
          phone: string | null
          primeiro_criado_em: string | null
          status_envolvidos: string[] | null
          ultimo_criado_em: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_event_metrics_hourly: {
        Row: {
          error_count: number | null
          event_count: number | null
          event_name: string | null
          hour_start: string | null
          operation_type: string | null
          p50_duration_ms: number | null
          p95_duration_ms: number | null
          p99_duration_ms: number | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      ops_operation_health: {
        Row: {
          oldest_started_at: string | null
          operation_count: number | null
          operation_type: string | null
          p50_duration_ms: number | null
          p95_duration_ms: number | null
          p99_duration_ms: number | null
          status: string | null
        }
        Relationships: []
      }
      ops_orphan_charges: {
        Row: {
          action_name: string | null
          cobrado_em: string | null
          cost: number | null
          metadata: Json | null
          usage_log_id: string | null
          user_id: string | null
        }
        Insert: {
          action_name?: string | null
          cobrado_em?: string | null
          cost?: number | null
          metadata?: Json | null
          usage_log_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_name?: string | null
          cobrado_em?: string | null
          cost?: number | null
          metadata?: Json | null
          usage_log_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_pending_account_deletions: {
        Row: {
          acknowledge_by: string | null
          age: string | null
          agency_name: string | null
          complete_by: string | null
          email: string | null
          overdue: boolean | null
          request_id: string | null
          requested_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      ops_queue_latest: {
        Row: {
          captured_at: string | null
          failed_count: number | null
          oldest_age_seconds: number | null
          processing_count: number | null
          queue_depth: number | null
          queue_name: string | null
          source: string | null
        }
        Relationships: []
      }
      ops_stuck_copy_requests: {
        Row: {
          copy_request_id: string | null
          created_at: string | null
          idade: string | null
          leads_pedidos: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          copy_request_id?: string | null
          created_at?: string | null
          idade?: never
          leads_pedidos?: never
          status?: string | null
          user_id?: string | null
        }
        Update: {
          copy_request_id?: string | null
          created_at?: string | null
          idade?: never
          leads_pedidos?: never
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ops_stuck_leads: {
        Row: {
          lead_id: string | null
          parado_ha: string | null
          sem_copy: boolean | null
          send_claimed_at: string | null
          send_claimed_but_not_sent: boolean | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          lead_id?: string | null
          parado_ha?: never
          sem_copy?: never
          send_claimed_at?: string | null
          send_claimed_but_not_sent?: never
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          lead_id?: string | null
          parado_ha?: never
          sem_copy?: never
          send_claimed_at?: string | null
          send_claimed_but_not_sent?: never
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_stuck_searches: {
        Row: {
          created_at: string | null
          idade: string | null
          leads_entregues: number | null
          leads_found: number | null
          quantity_requested: number | null
          search_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          idade?: never
          leads_entregues?: never
          leads_found?: number | null
          quantity_requested?: number | null
          search_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          idade?: never
          leads_entregues?: never
          leads_found?: number | null
          quantity_requested?: number | null
          search_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_credits: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      admin_apply_subscription_credits: {
        Args: {
          _cap_limit: number
          _credits_requested: number
          _plan_id: string
          _user_id: string
        }
        Returns: Json
      }
      admin_update_user_profile: {
        Args: {
          _clear_plan?: boolean
          _credits_balance?: number
          _email?: string
          _full_name?: string
          _id: string
          _plan_id?: string
          _role?: string
          _sdr_phone?: string
        }
        Returns: undefined
      }
      assign_lead_to_user:
        | { Args: { _lead_id: string; _user_id: string }; Returns: Json }
        | {
            Args: { _lead_id: string; _search_id?: string; _user_id: string }
            Returns: Json
          }
      assign_leads_to_user: {
        Args: { _lead_ids: string[]; _search_id?: string; _user_id: string }
        Returns: Json
      }
      complete_copy_request: {
        Args: { _request_id: string; _status: string }
        Returns: Json
      }
      deduct_credits:
        | {
            Args: {
              _action_name: string
              _lead_id?: string
              _metadata?: Json
              _user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _action_name: string
              _lead_id?: string
              _metadata?: Json
              _phone?: string
              _user_id: string
            }
            Returns: Json
          }
      deduct_credits_bulk:
        | {
            Args: {
              _action_name: string
              _lead_id?: string
              _metadata?: Json
              _quantity: number
              _user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _action_name: string
              _lead_id?: string
              _metadata?: Json
              _phone?: string
              _quantity: number
              _user_id: string
            }
            Returns: Json
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      fail_copy_request: { Args: { _request_id: string }; Returns: Json }
      fail_search: { Args: { _search_id: string }; Returns: Json }
      get_admin_copy_quality: { Args: never; Returns: Json }
      get_admin_system_health: { Args: never; Returns: Json }
      get_admin_system_health_history: {
        Args: { _hours?: number }
        Returns: Json
      }
      get_current_user_role: { Args: never; Returns: string }
      get_lead_pool_summary: {
        Args: never
        Returns: {
          category: string
          count: number
        }[]
      }
      get_pool_summary_by_category: {
        Args: never
        Returns: {
          lead_category: string
          leads_count: number
          niche_name: string
          reserve_count: number
          total_count: number
        }[]
      }
      get_send_queue_batch: {
        Args: never
        Returns: {
          out_agency: Json
          out_context: Json
          out_lead: Json
          out_lead_id: string
          out_phone: string
          out_user_id: string
        }[]
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      observability_attributes_are_safe: {
        Args: { _attributes: Json }
        Returns: boolean
      }
      promote_reserve_to_pool: { Args: never; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_operation_run: {
        Args: {
          _attempt_increment?: boolean
          _attributes?: Json
          _correlation_id: string
          _error_code?: string
          _occurred_at?: string
          _operation_type: string
          _request_id?: string
          _session_id?: string
          _source: string
          _status: string
        }
        Returns: string
      }
      record_operational_event: {
        Args: {
          _attributes?: Json
          _correlation_id?: string
          _duration_ms?: number
          _entity_id?: string
          _entity_type?: string
          _error_code?: string
          _event_id?: string
          _event_name: string
          _occurred_at?: string
          _operation_type?: string
          _request_id?: string
          _route_key?: string
          _session_id?: string
          _source: string
          _status?: string
        }
        Returns: string
      }
      record_queue_metric: {
        Args: {
          _attributes?: Json
          _captured_at?: string
          _correlation_id?: string
          _failed_count?: number
          _oldest_age_seconds?: number
          _processing_count?: number
          _queue_depth: number
          _queue_name: string
          _source: string
        }
        Returns: number
      }
      refund_unused_search_credits: {
        Args: { _search_id: string }
        Returns: Json
      }
      request_account_deletion: { Args: never; Returns: Json }
      request_copy: {
        Args: { _lead_ids: string[]; _request_id: string }
        Returns: Json
      }
      request_find_leads: {
        Args: {
          _limit_per_niche: number
          _quantity: number
          _request_id: string
          _require_instagram?: boolean
          _require_website?: boolean
        }
        Returns: Json
      }
      request_send: {
        Args: { _lead_ids: string[]; _request_id: string }
        Returns: Json
      }
      validate_webhook_url: { Args: { _url: string }; Returns: boolean }
      verify_email_queue_token: { Args: { _token: string }; Returns: boolean }
      verify_ops_alert_token: { Args: { _token: string }; Returns: boolean }
    }
    Enums: {
      business_type: "trafego_pago" | "automacao_ia"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      business_type: ["trafego_pago", "automacao_ia"],
    },
  },
} as const
