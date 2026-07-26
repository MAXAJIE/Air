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
      amenity_checks: {
        Row: {
          actual_qty: number
          amenity_definition_id: string
          checked_at: string
          checked_by_user_id: string | null
          cleaning_job_id: string | null
          customer_session_id: string | null
          expected_qty_snapshot: number
          id: string
          is_discrepancy: boolean
          photo_url: string | null
          property_id: string
          role: Database["public"]["Enums"]["check_role"]
        }
        Insert: {
          actual_qty: number
          amenity_definition_id: string
          checked_at?: string
          checked_by_user_id?: string | null
          cleaning_job_id?: string | null
          customer_session_id?: string | null
          expected_qty_snapshot?: number
          id?: string
          is_discrepancy?: boolean
          photo_url?: string | null
          property_id: string
          role: Database["public"]["Enums"]["check_role"]
        }
        Update: {
          actual_qty?: number
          amenity_definition_id?: string
          checked_at?: string
          checked_by_user_id?: string | null
          cleaning_job_id?: string | null
          customer_session_id?: string | null
          expected_qty_snapshot?: number
          id?: string
          is_discrepancy?: boolean
          photo_url?: string | null
          property_id?: string
          role?: Database["public"]["Enums"]["check_role"]
        }
        Relationships: [
          {
            foreignKeyName: "amenity_checks_amenity_definition_id_fkey"
            columns: ["amenity_definition_id"]
            isOneToOne: false
            referencedRelation: "amenity_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_checks_cleaning_job_id_fkey"
            columns: ["cleaning_job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_checks_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_checks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_definitions: {
        Row: {
          expected_qty: number
          id: string
          image_path: string | null
          name: string
          notes: string | null
          property_id: string
          template_id: string | null
        }
        Insert: {
          expected_qty?: number
          id?: string
          image_path?: string | null
          name: string
          notes?: string | null
          property_id: string
          template_id?: string | null
        }
        Update: {
          expected_qty?: number
          id?: string
          image_path?: string | null
          name?: string
          notes?: string | null
          property_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amenity_definitions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_definitions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "amenity_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_template_items: {
        Row: {
          expected_qty: number
          id: string
          image_path: string | null
          name: string
          notes: string | null
          sort_order: number
          template_id: string
        }
        Insert: {
          expected_qty?: number
          id?: string
          image_path?: string | null
          name: string
          notes?: string | null
          sort_order?: number
          template_id: string
        }
        Update: {
          expected_qty?: number
          id?: string
          image_path?: string | null
          name?: string
          notes?: string | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "amenity_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_templates_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_ratings: {
        Row: {
          cleaner_user_id: string
          cleaning_job_id: string | null
          comment: string | null
          created_at: string
          customer_session_id: string | null
          id: string
          property_id: string
          rating: number
        }
        Insert: {
          cleaner_user_id: string
          cleaning_job_id?: string | null
          comment?: string | null
          created_at?: string
          customer_session_id?: string | null
          id?: string
          property_id: string
          rating: number
        }
        Update: {
          cleaner_user_id?: string
          cleaning_job_id?: string | null
          comment?: string | null
          created_at?: string
          customer_session_id?: string | null
          id?: string
          property_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_ratings_cleaning_job_id_fkey"
            columns: ["cleaning_job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_ratings_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_ratings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_job_items: {
        Row: {
          cleaning_job_id: string
          description: string
          id: string
          is_checked: boolean
          photo_url: string | null
          sort_order: number
        }
        Insert: {
          cleaning_job_id: string
          description: string
          id?: string
          is_checked?: boolean
          photo_url?: string | null
          sort_order?: number
        }
        Update: {
          cleaning_job_id?: string
          description?: string
          id?: string
          is_checked?: boolean
          photo_url?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_job_items_cleaning_job_id_fkey"
            columns: ["cleaning_job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_jobs: {
        Row: {
          assigned_hr_company_id: string | null
          assigned_to_user_id: string | null
          assigned_via: Database["public"]["Enums"]["assigned_via"]
          completed_at: string | null
          created_at: string
          id: string
          owner_group_id: string
          property_id: string
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          template_id: string | null
        }
        Insert: {
          assigned_hr_company_id?: string | null
          assigned_to_user_id?: string | null
          assigned_via?: Database["public"]["Enums"]["assigned_via"]
          completed_at?: string | null
          created_at?: string
          id?: string
          owner_group_id: string
          property_id: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_id?: string | null
        }
        Update: {
          assigned_hr_company_id?: string | null
          assigned_to_user_id?: string | null
          assigned_via?: Database["public"]["Enums"]["assigned_via"]
          completed_at?: string | null
          created_at?: string
          id?: string
          owner_group_id?: string
          property_id?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_jobs_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cleaning_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_template_items: {
        Row: {
          description: string
          id: string
          notes: string | null
          requires_photo: boolean
          sort_order: number
          template_id: string
        }
        Insert: {
          description: string
          id?: string
          notes?: string | null
          requires_photo?: boolean
          sort_order?: number
          template_id: string
        }
        Update: {
          description?: string
          id?: string
          notes?: string | null
          requires_photo?: boolean
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cleaning_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_templates_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          property_id: string
          room_code: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          property_id: string
          room_code: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          property_id?: string
          room_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_affiliations: {
        Row: {
          created_at: string
          hr_company_user_id: string
          id: string
          owner_group_id: string
          status: Database["public"]["Enums"]["membership_status"]
        }
        Insert: {
          created_at?: string
          hr_company_user_id: string
          id?: string
          owner_group_id: string
          status?: Database["public"]["Enums"]["membership_status"]
        }
        Update: {
          created_at?: string
          hr_company_user_id?: string
          id?: string
          owner_group_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
        }
        Relationships: [
          {
            foreignKeyName: "hr_affiliations_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_company_roster: {
        Row: {
          added_at: string
          cleaner_user_id: string
          hr_company_user_id: string
          id: string
          status: Database["public"]["Enums"]["membership_status"]
        }
        Insert: {
          added_at?: string
          cleaner_user_id: string
          hr_company_user_id: string
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
        }
        Update: {
          added_at?: string
          cleaner_user_id?: string
          hr_company_user_id?: string
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
        }
        Relationships: []
      }
      hr_invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          hr_company_user_id: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          hr_company_user_id: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          hr_company_user_id?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string
          id: string
          owner_group_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by: string
          id?: string
          owner_group_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          owner_group_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          joined_via_invite_code_id: string | null
          owner_group_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_via_invite_code_id?: string | null
          owner_group_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_via_invite_code_id?: string | null
          owner_group_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          plan: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          plan?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          plan?: string
        }
        Relationships: []
      }
      payment_qr_codes: {
        Row: {
          active: boolean
          content_type: string | null
          created_at: string
          id: string
          label: string | null
          owner_group_id: string
          qr_image_enc: string | null
          qr_image_url: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          content_type?: string | null
          created_at?: string
          id?: string
          label?: string | null
          owner_group_id: string
          qr_image_enc?: string | null
          qr_image_url?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          content_type?: string | null
          created_at?: string
          id?: string
          label?: string | null
          owner_group_id?: string
          qr_image_enc?: string | null
          qr_image_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_qr_codes_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          address_enc: string | null
          completed: boolean
          created_at: string
          dob_enc: string | null
          emergency_name_enc: string | null
          emergency_phone_enc: string | null
          full_name_enc: string | null
          id_number_enc: string | null
          id_number_last4: string | null
          phone_enc: string | null
          phone_last4: string | null
          selfie_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_enc?: string | null
          completed?: boolean
          created_at?: string
          dob_enc?: string | null
          emergency_name_enc?: string | null
          emergency_phone_enc?: string | null
          full_name_enc?: string | null
          id_number_enc?: string | null
          id_number_last4?: string | null
          phone_enc?: string | null
          phone_last4?: string | null
          selfie_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_enc?: string | null
          completed?: boolean
          created_at?: string
          dob_enc?: string | null
          emergency_name_enc?: string | null
          emergency_phone_enc?: string | null
          full_name_enc?: string | null
          id_number_enc?: string | null
          id_number_last4?: string | null
          phone_enc?: string | null
          phone_last4?: string | null
          selfie_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          display_name_updated_at: string | null
          email: string
          locale: string
          primary_role: Database["public"]["Enums"]["app_role"] | null
          self_secondary_role:
            | Database["public"]["Enums"]["membership_role"]
            | null
          user_id: string
          username: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          display_name_updated_at?: string | null
          email: string
          locale?: string
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          self_secondary_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          user_id: string
          username: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          display_name_updated_at?: string | null
          email?: string
          locale?: string
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          self_secondary_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_code: string | null
          address: string | null
          created_at: string
          default_template_id: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          owner_group_id: string
          photo_path: string | null
          place_name: string | null
          status_id: string | null
        }
        Insert: {
          access_code?: string | null
          address?: string | null
          created_at?: string
          default_template_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          owner_group_id: string
          photo_path?: string | null
          place_name?: string | null
          status_id?: string | null
        }
        Update: {
          access_code?: string | null
          address?: string | null
          created_at?: string
          default_template_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          owner_group_id?: string
          photo_path?: string | null
          place_name?: string | null
          status_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "cleaning_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "property_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      property_statuses: {
        Row: {
          color: string
          id: string
          label: string
          owner_group_id: string
          sort_order: number
        }
        Insert: {
          color?: string
          id?: string
          label: string
          owner_group_id: string
          sort_order?: number
        }
        Update: {
          color?: string
          id?: string
          label?: string
          owner_group_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_statuses_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      room_condition_photos: {
        Row: {
          id: string
          photo_url: string
          submission_id: string
        }
        Insert: {
          id?: string
          photo_url: string
          submission_id: string
        }
        Update: {
          id?: string
          photo_url?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_condition_photos_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "room_condition_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      room_condition_submissions: {
        Row: {
          customer_session_id: string | null
          id: string
          notes: string | null
          overall_rating: number | null
          property_id: string
          submitted_at: string
        }
        Insert: {
          customer_session_id?: string | null
          id?: string
          notes?: string | null
          overall_rating?: number | null
          property_id: string
          submitted_at?: string
        }
        Update: {
          customer_session_id?: string | null
          id?: string
          notes?: string | null
          overall_rating?: number | null
          property_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_condition_submissions_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_condition_submissions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          active: boolean
          description: string | null
          id: string
          name: string
          owner_group_id: string
          photo_path: string | null
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          description?: string | null
          id?: string
          name: string
          owner_group_id: string
          photo_path?: string | null
          price?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          description?: string | null
          id?: string
          name?: string
          owner_group_id?: string
          photo_path?: string | null
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_order_items: {
        Row: {
          id: string
          name_snapshot: string
          order_id: string
          quantity: number
          shopping_item_id: string | null
          unit_price_snapshot: number
        }
        Insert: {
          id?: string
          name_snapshot: string
          order_id: string
          quantity?: number
          shopping_item_id?: string | null
          unit_price_snapshot?: number
        }
        Update: {
          id?: string
          name_snapshot?: string
          order_id?: string
          quantity?: number
          shopping_item_id?: string | null
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shopping_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_order_items_shopping_item_id_fkey"
            columns: ["shopping_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_orders: {
        Row: {
          assigned_worker_id: string | null
          created_at: string
          customer_session_id: string | null
          id: string
          payment_proof_amount_entered: number | null
          payment_proof_photo_url: string | null
          property_id: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          verified_at: string | null
        }
        Insert: {
          assigned_worker_id?: string | null
          created_at?: string
          customer_session_id?: string | null
          id?: string
          payment_proof_amount_entered?: number | null
          payment_proof_photo_url?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          verified_at?: string | null
        }
        Update: {
          assigned_worker_id?: string | null
          created_at?: string
          customer_session_id?: string | null
          id?: string
          payment_proof_amount_entered?: number | null
          payment_proof_photo_url?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_orders_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      special_requests: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          customer_session_id: string | null
          description: string
          id: string
          property_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          customer_session_id?: string | null
          description: string
          id?: string
          property_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          customer_session_id?: string | null
          description?: string
          id?: string
          property_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "special_requests_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          cleaning_job_id: string | null
          created_at: string
          created_by_user_id: string
          description: string | null
          due_at: string | null
          id: string
          is_private: boolean
          owner_group_id: string | null
          proof_photo_path: string | null
          property_id: string | null
          source: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          cleaning_job_id?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          due_at?: string | null
          id?: string
          is_private?: boolean
          owner_group_id?: string | null
          proof_photo_path?: string | null
          property_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Update: {
          assigned_to_user_id?: string | null
          cleaning_job_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          due_at?: string | null
          id?: string
          is_private?: boolean
          owner_group_id?: string | null
          proof_photo_path?: string | null
          property_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_cleaning_job_id_fkey"
            columns: ["cleaning_job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_group_id_fkey"
            columns: ["owner_group_id"]
            isOneToOne: false
            referencedRelation: "owner_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      amenity_template_group: { Args: { _tpl: string }; Returns: string }
      apply_amenity_template: {
        Args: { p_property: string; p_replace?: boolean; p_template: string }
        Returns: number
      }
      can_view_pii: { Args: { _user: string }; Returns: boolean }
      delete_payment_qr: { Args: { p_group: string }; Returns: undefined }
      get_payment_qr: { Args: { p_group: string }; Returns: Json }
      get_pii: { Args: { _user: string }; Returns: Json }
      group_owner_id: { Args: { _group: string }; Returns: string }
      is_group_member: { Args: { _group: string }; Returns: boolean }
      is_group_owner: { Args: { _group: string }; Returns: boolean }
      is_hr_affiliated: { Args: { _group: string }; Returns: boolean }
      job_assignee: { Args: { _job: string }; Returns: string }
      job_group: { Args: { _job: string }; Returns: string }
      order_property: { Args: { _order: string }; Returns: string }
      order_worker: { Args: { _order: string }; Returns: string }
      pii_key: { Args: never; Returns: string }
      property_group: { Args: { _property: string }; Returns: string }
      redeem_hr_invite_code: { Args: { p_code: string }; Returns: Json }
      redeem_invite_code: { Args: { p_code: string }; Returns: Json }
      save_payment_qr: {
        Args: {
          p_content_type: string
          p_data_base64: string
          p_group: string
          p_label?: string
        }
        Returns: string
      }
      save_my_pii: {
        Args: {
          p_address: string
          p_dob: string
          p_emergency_name: string
          p_emergency_phone: string
          p_full_name: string
          p_id_number: string
          p_phone: string
          p_selfie_path: string
        }
        Returns: undefined
      }
      shares_group_with: { Args: { _other: string }; Returns: boolean }
      submission_property: { Args: { _sub: string }; Returns: string }
      template_group: { Args: { _tpl: string }; Returns: string }
      username_available: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "cleaner" | "worker" | "hr_company"
      assigned_via: "direct" | "hr_request"
      check_role: "owner" | "cleaner" | "customer"
      job_status: "pending" | "in_progress" | "submitted" | "reviewed"
      membership_role: "owner" | "cleaner" | "worker"
      membership_status: "active" | "removed"
      order_status:
        | "pending_payment"
        | "proof_submitted"
        | "verified"
        | "assigned"
        | "fulfilled"
      request_status: "open" | "assigned" | "resolved"
      task_status: "pending" | "done" | "in_progress" | "submitted"
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
      app_role: ["owner", "cleaner", "worker", "hr_company"],
      assigned_via: ["direct", "hr_request"],
      check_role: ["owner", "cleaner", "customer"],
      job_status: ["pending", "in_progress", "submitted", "reviewed"],
      membership_role: ["owner", "cleaner", "worker"],
      membership_status: ["active", "removed"],
      order_status: [
        "pending_payment",
        "proof_submitted",
        "verified",
        "assigned",
        "fulfilled",
      ],
      request_status: ["open", "assigned", "resolved"],
      task_status: ["pending", "done", "in_progress", "submitted"],
    },
  },
} as const
