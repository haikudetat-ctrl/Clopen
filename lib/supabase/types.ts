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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      availability: {
        Row: {
          day_of_week: number
          end_time: string
          id: string
          staff_id: string
          start_time: string
        }
        Insert: {
          day_of_week: number
          end_time: string
          id?: string
          staff_id: string
          start_time: string
        }
        Update: {
          day_of_week?: number
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      beverage_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beverage_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      beverage_items: {
        Row: {
          abv: number | null
          acidity: string | null
          body: string | null
          category_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_by_the_glass: boolean
          is_featured: boolean
          name: string
          pairing_notes: string | null
          price_bottle: number | null
          price_glass: number | null
          price_pour: number | null
          producer: string | null
          region: string | null
          restaurant_id: string
          staff_talking_points: string | null
          style: string | null
          sweetness: string | null
          tannin: string | null
          tasting_notes: string | null
          updated_at: string
          updated_by: string | null
          varietal_or_type: string | null
        }
        Insert: {
          abv?: number | null
          acidity?: string | null
          body?: string | null
          category_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_by_the_glass?: boolean
          is_featured?: boolean
          name: string
          pairing_notes?: string | null
          price_bottle?: number | null
          price_glass?: number | null
          price_pour?: number | null
          producer?: string | null
          region?: string | null
          restaurant_id: string
          staff_talking_points?: string | null
          style?: string | null
          sweetness?: string | null
          tannin?: string | null
          tasting_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          varietal_or_type?: string | null
        }
        Update: {
          abv?: number | null
          acidity?: string | null
          body?: string | null
          category_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_by_the_glass?: boolean
          is_featured?: boolean
          name?: string
          pairing_notes?: string | null
          price_bottle?: number | null
          price_glass?: number | null
          price_pour?: number | null
          producer?: string | null
          region?: string | null
          restaurant_id?: string
          staff_talking_points?: string | null
          style?: string | null
          sweetness?: string | null
          tannin?: string | null
          tasting_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          varietal_or_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beverage_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "beverage_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beverage_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beverage_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beverage_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          budgeted_amount: number
          created_at: string
          fiscal_period_id: string
          gl_account_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          budgeted_amount: number
          created_at?: string
          fiscal_period_id: string
          gl_account_id: string
          id?: string
          notes?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          budgeted_amount?: number
          created_at?: string
          fiscal_period_id?: string
          gl_account_id?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktail_versions: {
        Row: {
          change_notes: string | null
          changed_by: string | null
          cocktail_id: string
          created_at: string
          id: string
          snapshot_json: Json
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          changed_by?: string | null
          cocktail_id: string
          created_at?: string
          id?: string
          snapshot_json?: Json
          version_number: number
        }
        Update: {
          change_notes?: string | null
          changed_by?: string | null
          cocktail_id?: string
          created_at?: string
          id?: string
          snapshot_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cocktail_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktail_versions_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktails: {
        Row: {
          abv_level: string | null
          allergens: string[]
          build_spec: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          flavor_profile: string | null
          garnish: string | null
          glassware: string | null
          ice: string | null
          id: string
          ingredients: string | null
          is_active: boolean
          is_featured: boolean
          method: string | null
          name: string
          price: number | null
          restaurant_id: string
          service_notes: string | null
          substitution_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          abv_level?: string | null
          allergens?: string[]
          build_spec?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flavor_profile?: string | null
          garnish?: string | null
          glassware?: string | null
          ice?: string | null
          id?: string
          ingredients?: string | null
          is_active?: boolean
          is_featured?: boolean
          method?: string | null
          name: string
          price?: number | null
          restaurant_id: string
          service_notes?: string | null
          substitution_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          abv_level?: string | null
          allergens?: string[]
          build_spec?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flavor_profile?: string | null
          garnish?: string | null
          glassware?: string | null
          ice?: string | null
          id?: string
          ingredients?: string | null
          is_active?: boolean
          is_featured?: boolean
          method?: string | null
          name?: string
          price?: number | null
          restaurant_id?: string
          service_notes?: string | null
          substitution_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cocktails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktails_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktails_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_item_sales: {
        Row: {
          category: string
          cocktail_id: string | null
          created_at: string
          discounts: number
          gross_amount: number
          id: string
          item_name: string
          menu_group: string
          menu_item_id: string | null
          net_amount: number
          quantity: number
          refunds: number
          restaurant_id: string
          sales_category_raw: string | null
          sales_date: string
          voids: number
        }
        Insert: {
          category: string
          cocktail_id?: string | null
          created_at?: string
          discounts?: number
          gross_amount?: number
          id?: string
          item_name: string
          menu_group?: string
          menu_item_id?: string | null
          net_amount?: number
          quantity?: number
          refunds?: number
          restaurant_id: string
          sales_category_raw?: string | null
          sales_date: string
          voids?: number
        }
        Update: {
          category?: string
          cocktail_id?: string | null
          created_at?: string
          discounts?: number
          gross_amount?: number
          id?: string
          item_name?: string
          menu_group?: string
          menu_item_id?: string | null
          net_amount?: number
          quantity?: number
          refunds?: number
          restaurant_id?: string
          sales_category_raw?: string | null
          sales_date?: string
          voids?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_item_sales_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_item_sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_item_sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales: {
        Row: {
          comps: number
          created_at: string
          discounts: number
          gl_account_id: string
          gross_amount: number
          id: string
          net_amount: number | null
          restaurant_id: string
          sales_date: string
        }
        Insert: {
          comps?: number
          created_at?: string
          discounts?: number
          gl_account_id: string
          gross_amount: number
          id?: string
          net_amount?: number | null
          restaurant_id: string
          sales_date: string
        }
        Update: {
          comps?: number
          created_at?: string
          discounts?: number
          gl_account_id?: string
          gross_amount?: number
          id?: string
          net_amount?: number | null
          restaurant_id?: string
          sales_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summary: {
        Row: {
          check_count: number | null
          covers: number | null
          created_at: string
          id: string
          notes: string | null
          recorded_by: string | null
          refunds: number
          reported_gross_sales: number | null
          reported_net_sales: number | null
          restaurant_id: string
          sales_date: string
          service_charges: number
          source: string
          tax_collected: number
          tips_total: number
          updated_at: string
          voids: number
        }
        Insert: {
          check_count?: number | null
          covers?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          refunds?: number
          reported_gross_sales?: number | null
          reported_net_sales?: number | null
          restaurant_id: string
          sales_date: string
          service_charges?: number
          source?: string
          tax_collected?: number
          tips_total?: number
          updated_at?: string
          voids?: number
        }
        Update: {
          check_count?: number | null
          covers?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          refunds?: number
          reported_gross_sales?: number | null
          reported_net_sales?: number | null
          restaurant_id?: string
          sales_date?: string
          service_charges?: number
          source?: string
          tax_collected?: number
          tips_total?: number
          updated_at?: string
          voids?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_summary_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_sales_summary_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_tenders: {
        Row: {
          amount: number
          created_at: string
          id: string
          restaurant_id: string
          sales_date: string
          tender_type: string
          txn_count: number | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          restaurant_id: string
          sales_date: string
          tender_type: string
          txn_count?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          restaurant_id?: string
          sales_date?: string
          tender_type?: string
          txn_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_tenders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          created_at: string
          fiscal_year: number
          id: string
          organization_id: string
          period_end: string
          period_number: number
          period_start: string
          quarter: number
          week_count: number
        }
        Insert: {
          created_at?: string
          fiscal_year: number
          id?: string
          organization_id: string
          period_end: string
          period_number: number
          period_start: string
          quarter: number
          week_count: number
        }
        Update: {
          created_at?: string
          fiscal_year?: number
          id?: string
          organization_id?: string
          period_end?: string
          period_number?: number
          period_start?: string
          quarter?: number
          week_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_account_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_account_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_account_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string
          gl_account_id: string | null
          id: string
          name: string
          organization_id: string
          parent_category_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          gl_account_id?: string | null
          id?: string
          name: string
          organization_id: string
          parent_category_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          gl_account_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_category_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          counted_quantity: number
          counted_quantity_base_unit: number | null
          created_at: string
          expected_quantity_base_unit: number
          id: string
          inventory_count_id: string
          inventory_item_id: string
          notes: string | null
          restaurant_id: string
          unit_cost_at_count: number
          unit_id: string
          variance_base_unit: number | null
          variance_value: number | null
        }
        Insert: {
          counted_quantity: number
          counted_quantity_base_unit?: number | null
          created_at?: string
          expected_quantity_base_unit?: number
          id?: string
          inventory_count_id: string
          inventory_item_id: string
          notes?: string | null
          restaurant_id: string
          unit_cost_at_count?: number
          unit_id: string
          variance_base_unit?: number | null
          variance_value?: number | null
        }
        Update: {
          counted_quantity?: number
          counted_quantity_base_unit?: number | null
          created_at?: string
          expected_quantity_base_unit?: number
          id?: string
          inventory_count_id?: string
          inventory_item_id?: string
          notes?: string | null
          restaurant_id?: string
          unit_cost_at_count?: number
          unit_id?: string
          variance_base_unit?: number | null
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          opened_at: string
          period_end: string
          period_start: string
          restaurant_id: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          period_end: string
          period_start: string
          restaurant_id: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          period_end?: string
          period_start?: string
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_periods_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          area_label: string | null
          count_period_id: string
          counted_by: string | null
          created_at: string
          id: string
          restaurant_id: string
          started_at: string
          status: string
          submitted_at: string | null
        }
        Insert: {
          area_label?: string | null
          count_period_id: string
          counted_by?: string | null
          created_at?: string
          id?: string
          restaurant_id: string
          started_at?: string
          status?: string
          submitted_at?: string | null
        }
        Update: {
          area_label?: string | null
          count_period_id?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          restaurant_id?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_count_period_id_fkey"
            columns: ["count_period_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_units: {
        Row: {
          conversion_factor: number
          created_at: string
          id: string
          inventory_item_id: string
          is_count_unit: boolean
          is_purchase_unit: boolean
          is_recipe_unit: boolean
          unit_id: string
        }
        Insert: {
          conversion_factor: number
          created_at?: string
          id?: string
          inventory_item_id: string
          is_count_unit?: boolean
          is_purchase_unit?: boolean
          is_recipe_unit?: boolean
          unit_id: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_count_unit?: boolean
          is_purchase_unit?: boolean
          is_recipe_unit?: boolean
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_units_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          base_unit_id: string
          category_id: string | null
          costing_method: string
          created_at: string
          current_unit_cost: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sku: string | null
          storage_location: string | null
          updated_at: string
        }
        Insert: {
          base_unit_id: string
          category_id?: string | null
          costing_method?: string
          created_at?: string
          current_unit_cost?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sku?: string | null
          storage_location?: string | null
          updated_at?: string
        }
        Update: {
          base_unit_id?: string
          category_id?: string | null
          costing_method?: string
          created_at?: string
          current_unit_cost?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sku?: string | null
          storage_location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_par_levels: {
        Row: {
          id: string
          inventory_item_id: string
          par_level_quantity: number
          preferred_vendor_item_id: string | null
          reorder_point: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          inventory_item_id: string
          par_level_quantity?: number
          preferred_vendor_item_id?: string | null
          reorder_point?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          inventory_item_id?: string
          par_level_quantity?: number
          preferred_vendor_item_id?: string | null
          reorder_point?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_par_levels_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_par_levels_preferred_vendor_item_id_fkey"
            columns: ["preferred_vendor_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_par_levels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          notes: string | null
          occurred_at: string
          quantity_delta: number
          reason_code: string | null
          reference_id: string | null
          reference_table: string | null
          restaurant_id: string
          transaction_type: string
          unit_cost_at_transaction: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          notes?: string | null
          occurred_at?: string
          quantity_delta: number
          reason_code?: string | null
          reference_id?: string | null
          reference_table?: string | null
          restaurant_id: string
          transaction_type: string
          unit_cost_at_transaction: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          notes?: string | null
          occurred_at?: string
          quantity_delta?: number
          reason_code?: string | null
          reference_id?: string | null
          reference_table?: string | null
          restaurant_id?: string
          transaction_type?: string
          unit_cost_at_transaction?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_ledger_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_lines: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          quantity: number
          quantity_base_unit: number | null
          transfer_id: string
          unit_cost_at_transfer: number | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity: number
          quantity_base_unit?: number | null
          transfer_id: string
          unit_cost_at_transfer?: number | null
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity?: number
          quantity_base_unit?: number | null
          transfer_id?: string
          unit_cost_at_transfer?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          from_restaurant_id: string
          id: string
          initiated_at: string
          initiated_by: string | null
          notes: string | null
          organization_id: string
          received_at: string | null
          received_by: string | null
          status: string
          to_restaurant_id: string
        }
        Insert: {
          created_at?: string
          from_restaurant_id: string
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          notes?: string | null
          organization_id: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          to_restaurant_id: string
        }
        Update: {
          created_at?: string
          from_restaurant_id?: string
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          notes?: string | null
          organization_id?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          to_restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_restaurant_id_fkey"
            columns: ["from_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_restaurant_id_fkey"
            columns: ["to_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string | null
          gl_account_id: string | null
          id: string
          inventory_item_id: string | null
          invoice_id: string
          line_total: number | null
          purchase_order_line_id: string | null
          purchase_order_receipt_line_id: string | null
          quantity: number
          quantity_base_unit: number | null
          restaurant_id: string
          unit_cost: number
          unit_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gl_account_id?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_id: string
          line_total?: number | null
          purchase_order_line_id?: string | null
          purchase_order_receipt_line_id?: string | null
          quantity: number
          quantity_base_unit?: number | null
          restaurant_id: string
          unit_cost: number
          unit_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gl_account_id?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string
          line_total?: number | null
          purchase_order_line_id?: string | null
          purchase_order_receipt_line_id?: string | null
          quantity?: number
          quantity_base_unit?: number | null
          restaurant_id?: string
          unit_cost?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_purchase_order_receipt_line_id_fkey"
            columns: ["purchase_order_receipt_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipt_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string | null
          purchase_order_id: string | null
          restaurant_id: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          purchase_order_id?: string | null
          restaurant_id: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          purchase_order_id?: string | null
          restaurant_id?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_allergen_guidance: {
        Row: {
          allergen_name: string
          created_at: string
          guidance_status: string
          id: string
          menu_item_id: string
          modification_note: string | null
          source_document: string | null
          updated_at: string
        }
        Insert: {
          allergen_name: string
          created_at?: string
          guidance_status: string
          id?: string
          menu_item_id: string
          modification_note?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Update: {
          allergen_name?: string
          created_at?: string
          guidance_status?: string
          id?: string
          menu_item_id?: string
          modification_note?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_allergen_guidance_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_active: boolean
          menu_item_id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_faqs_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          allergy_notes: string | null
          category_id: string | null
          common_modifications: string | null
          created_at: string
          created_by: string | null
          dietary_tags: string[]
          guest_description: string | null
          id: string
          ingredients: string | null
          internal_notes: string | null
          is_86d: boolean
          is_active: boolean
          mise_en_place: string[]
          name: string
          pairings: string | null
          prep_method: string | null
          price: number | null
          pronunciation: string | null
          restaurant_id: string
          service_script: string | null
          short_description: string | null
          source_document: string | null
          updated_at: string
          updated_by: string | null
          upsell_notes: string | null
        }
        Insert: {
          allergens?: string[]
          allergy_notes?: string | null
          category_id?: string | null
          common_modifications?: string | null
          created_at?: string
          created_by?: string | null
          dietary_tags?: string[]
          guest_description?: string | null
          id?: string
          ingredients?: string | null
          internal_notes?: string | null
          is_86d?: boolean
          is_active?: boolean
          mise_en_place?: string[]
          name: string
          pairings?: string | null
          prep_method?: string | null
          price?: number | null
          pronunciation?: string | null
          restaurant_id: string
          service_script?: string | null
          short_description?: string | null
          source_document?: string | null
          updated_at?: string
          updated_by?: string | null
          upsell_notes?: string | null
        }
        Update: {
          allergens?: string[]
          allergy_notes?: string | null
          category_id?: string | null
          common_modifications?: string | null
          created_at?: string
          created_by?: string | null
          dietary_tags?: string[]
          guest_description?: string | null
          id?: string
          ingredients?: string | null
          internal_notes?: string | null
          is_86d?: boolean
          is_active?: boolean
          mise_en_place?: string[]
          name?: string
          pairings?: string | null
          prep_method?: string | null
          price?: number | null
          pronunciation?: string | null
          restaurant_id?: string
          service_script?: string | null
          short_description?: string | null
          source_document?: string | null
          updated_at?: string
          updated_by?: string | null
          upsell_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          preferred_name: string | null
          restaurant_id: string | null
          role: string
          team: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id?: string | null
          preferred_name?: string | null
          restaurant_id?: string | null
          role?: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          preferred_name?: string | null
          restaurant_id?: string | null
          role?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          line_total: number | null
          purchase_order_id: string
          quantity_base_unit: number | null
          quantity_ordered: number
          restaurant_id: string
          unit_cost: number
          unit_id: string
          vendor_item_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          line_total?: number | null
          purchase_order_id: string
          quantity_base_unit?: number | null
          quantity_ordered: number
          restaurant_id: string
          unit_cost: number
          unit_id: string
          vendor_item_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          line_total?: number | null
          purchase_order_id?: string
          quantity_base_unit?: number | null
          quantity_ordered?: number
          restaurant_id?: string
          unit_cost?: number
          unit_id?: string
          vendor_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_vendor_item_id_fkey"
            columns: ["vendor_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_receipt_lines: {
        Row: {
          condition_notes: string | null
          created_at: string
          expiration_date: string | null
          id: string
          inventory_item_id: string
          line_total: number | null
          lot_number: string | null
          purchase_order_line_id: string
          quantity_base_unit: number | null
          quantity_received: number
          receipt_id: string
          restaurant_id: string
          unit_cost: number
          unit_id: string
        }
        Insert: {
          condition_notes?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          inventory_item_id: string
          line_total?: number | null
          lot_number?: string | null
          purchase_order_line_id: string
          quantity_base_unit?: number | null
          quantity_received: number
          receipt_id: string
          restaurant_id: string
          unit_cost: number
          unit_id: string
        }
        Update: {
          condition_notes?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          inventory_item_id?: string
          line_total?: number | null
          lot_number?: string | null
          purchase_order_line_id?: string
          quantity_base_unit?: number | null
          quantity_received?: number
          receipt_id?: string
          restaurant_id?: string
          unit_cost?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipt_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_receipts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          purchase_order_id: string
          received_at: string
          received_by: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id: string
          received_at?: string
          received_by?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string
          received_at?: string
          received_by?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          external_reference: string | null
          id: string
          notes: string | null
          order_date: string
          restaurant_id: string
          source: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          restaurant_id: string
          source?: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          restaurant_id?: string
          source?: string
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          cocktail_id: string | null
          created_at: string
          id: string
          inventory_item_id: string
          menu_item_id: string | null
          quantity: number
          quantity_base_unit: number | null
          sort_order: number
          unit_id: string
          yield_percent: number
        }
        Insert: {
          cocktail_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id: string
          menu_item_id?: string | null
          quantity: number
          quantity_base_unit?: number | null
          sort_order?: number
          unit_id: string
          yield_percent?: number
        }
        Update: {
          cocktail_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string | null
          quantity?: number
          quantity_base_unit?: number | null
          sort_order?: number
          unit_id?: string
          yield_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_name: string | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_name?: string | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_name?: string | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_import_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          file_kind: string
          header_signature: string
          id: string
          mapping: Json
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_kind?: string
          header_signature: string
          id?: string
          mapping: Json
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_kind?: string
          header_signature?: string
          id?: string
          mapping?: Json
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_import_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_imports: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          payload: Json
          replaced_import_id: string | null
          restaurant_id: string
          sales_date: string
          source: string
          source_files: string[] | null
          status: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          payload: Json
          replaced_import_id?: string | null
          restaurant_id: string
          sales_date: string
          source: string
          source_files?: string[] | null
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          payload?: Json
          replaced_import_id?: string | null
          restaurant_id?: string
          sales_date?: string
          source?: string
          source_files?: string[] | null
          status?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_imports_replaced_import_id_fkey"
            columns: ["replaced_import_id"]
            isOneToOne: false
            referencedRelation: "sales_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_assignments: {
        Row: {
          day: number
          id: string
          role: string
          schedule_id: string
          staff_id: string | null
          template_id: string
        }
        Insert: {
          day: number
          id?: string
          role: string
          schedule_id: string
          staff_id?: string | null
          template_id: string
        }
        Update: {
          day?: number
          id?: string
          role?: string
          schedule_id?: string
          staff_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          id: string
          restaurant_id: string
          week_start: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          week_start: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_note_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          shift_note_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          shift_note_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          shift_note_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_note_acknowledgements_shift_note_id_fkey"
            columns: ["shift_note_id"]
            isOneToOne: false
            referencedRelation: "shift_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_note_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_pinned: boolean
          note_scope: string
          priority: string
          restaurant_id: string
          service_date: string
          shift_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          note_scope?: string
          priority?: string
          restaurant_id: string
          service_date: string
          shift_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          note_scope?: string
          priority?: string
          restaurant_id?: string
          service_date?: string
          shift_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requirements: {
        Row: {
          id: string
          required_count: number
          role: string
          template_id: string
        }
        Insert: {
          id?: string
          required_count: number
          role: string
          template_id: string
        }
        Update: {
          id?: string
          required_count?: number
          role?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_requirements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          end_time: string
          id: string
          name: string
          restaurant_id: string
          start_time: string
        }
        Insert: {
          end_time: string
          id?: string
          name: string
          restaurant_id: string
          start_time: string
        }
        Update: {
          end_time?: string
          id?: string
          name?: string
          restaurant_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          id: string
          name: string
          restaurant_id: string
          roles: string[]
          skill_level: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          restaurant_id: string
          roles?: string[]
          skill_level: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          restaurant_id?: string
          roles?: string[]
          skill_level?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_compensation_history: {
        Row: {
          annual_salary: number | null
          compensation_type: string
          created_at: string
          effective_date: string
          end_date: string | null
          gl_account_id: string
          hourly_rate: number | null
          id: string
          staff_id: string
        }
        Insert: {
          annual_salary?: number | null
          compensation_type: string
          created_at?: string
          effective_date: string
          end_date?: string | null
          gl_account_id: string
          hourly_rate?: number | null
          id?: string
          staff_id: string
        }
        Update: {
          annual_salary?: number | null
          compensation_type?: string
          created_at?: string
          effective_date?: string
          end_date?: string | null
          gl_account_id?: string
          hourly_rate?: number | null
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_history_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_compensation_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_public: boolean
          question: string
          restaurant_id: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_public?: boolean
          question: string
          restaurant_id: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_public?: boolean
          question?: string
          restaurant_id?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_questions_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_questions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_questions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_suggestions: {
        Row: {
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          restaurant_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          suggestion_type: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          restaurant_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          suggestion_type: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          restaurant_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          suggestion_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_suggestions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_suggestions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: string | null
          estimated_minutes: number | null
          id: string
          is_active: boolean
          is_required: boolean
          restaurant_id: string
          role_scope: string
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          restaurant_id: string
          role_scope?: string
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          restaurant_id?: string
          role_scope?: string
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_modules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_modules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          last_viewed_at: string | null
          module_id: string
          score: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_viewed_at?: string | null
          module_id: string
          score?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_viewed_at?: string | null
          module_id?: string
          score?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          correct_answer: string | null
          created_at: string
          explanation: string | null
          id: string
          is_active: boolean
          module_id: string
          options_json: Json
          question: string
          question_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_active?: boolean
          module_id: string
          options_json?: Json
          question: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_active?: boolean
          module_id?: string
          options_json?: Json
          question?: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sections: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_active: boolean
          media_url: string | null
          module_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          module_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          module_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sections_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          name: string
          unit_type: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          name: string
          unit_type: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          name?: string
          unit_type?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata_json: Json
          restaurant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata_json?: Json
          restaurant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata_json?: Json
          restaurant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_items: {
        Row: {
          created_at: string
          current_unit_cost: number
          id: string
          inventory_item_id: string
          is_active: boolean
          is_preferred: boolean
          last_purchased_at: string | null
          pack_description: string | null
          purchase_unit_id: string
          updated_at: string
          vendor_id: string
          vendor_sku: string | null
        }
        Insert: {
          created_at?: string
          current_unit_cost: number
          id?: string
          inventory_item_id: string
          is_active?: boolean
          is_preferred?: boolean
          last_purchased_at?: string | null
          pack_description?: string | null
          purchase_unit_id: string
          updated_at?: string
          vendor_id: string
          vendor_sku?: string | null
        }
        Update: {
          created_at?: string
          current_unit_cost?: number
          id?: string
          inventory_item_id?: string
          is_active?: boolean
          is_preferred?: boolean
          last_purchased_at?: string | null
          pack_description?: string | null
          purchase_unit_id?: string
          updated_at?: string
          vendor_id?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          payment_terms: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          payment_terms?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          payment_terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_logs: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          logged_by: string | null
          notes: string | null
          occurred_at: string
          quantity: number
          quantity_base_unit: number | null
          reason: string
          restaurant_id: string
          unit_cost_at_waste: number | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          logged_by?: string | null
          notes?: string | null
          occurred_at?: string
          quantity: number
          quantity_base_unit?: number | null
          reason: string
          restaurant_id: string
          unit_cost_at_waste?: number | null
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          logged_by?: string | null
          notes?: string | null
          occurred_at?: string
          quantity?: number
          quantity_base_unit?: number | null
          reason?: string
          restaurant_id?: string
          unit_cost_at_waste?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_current_stock: {
        Row: {
          current_unit_cost: number | null
          inventory_item_id: string | null
          organization_id: string | null
          quantity_on_hand_base_unit: number | null
          restaurant_id: string | null
          value_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_ledger_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_manage_bar_note: { Args: { note_scope: string }; Returns: boolean }
      can_manage_beverage_program: { Args: never; Returns: boolean }
      can_manage_budget: { Args: never; Returns: boolean }
      can_manage_inventory_catalog: { Args: never; Returns: boolean }
      can_operate_inventory: { Args: never; Returns: boolean }
      can_record_sales: { Args: never; Returns: boolean }
      can_record_sales_for: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      can_view_financials: { Args: never; Returns: boolean }
      current_organization_id: { Args: never; Returns: string }
      current_restaurant_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      generate_fiscal_periods: {
        Args: {
          p_fiscal_year: number
          p_organization_id: string
          p_start_date: string
        }
        Returns: {
          created_at: string
          fiscal_year: number
          id: string
          organization_id: string
          period_end: string
          period_number: number
          period_start: string
          quarter: number
          week_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "fiscal_periods"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_item_full_view: {
        Args: { entity_id: string; entity_type: string }
        Returns: Json
      }
      get_menu_items_for_comms: { Args: never; Returns: Json }
      gl_actual_by_account: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          account_type: string
          actual_amount: number
          code: string
          gl_account_id: string
          name: string
        }[]
      }
      gl_actual_cogs: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          actual_amount: number
          gl_account_id: string
        }[]
      }
      gl_actual_labor: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          actual_amount: number
          gl_account_id: string
        }[]
      }
      gl_actual_opex: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          actual_amount: number
          gl_account_id: string
        }[]
      }
      gl_actual_revenue: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          actual_amount: number
          gl_account_id: string
        }[]
      }
      gl_budget_vs_actual: {
        Args: { p_fiscal_period_id: string; p_restaurant_id: string }
        Returns: {
          account_type: string
          actual_amount: number
          budgeted_amount: number
          code: string
          gl_account_id: string
          name: string
          variance: number
          variance_pct: number
        }[]
      }
      gl_daily_flash: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          labor_cost: number
          labor_pct: number
          net_sales: number
          sales_date: string
        }[]
      }
      gl_pnl_summary: {
        Args: {
          p_end_date: string
          p_restaurant_id: string
          p_start_date: string
        }
        Returns: {
          amount: number
          line_item: string
          pct_of_revenue: number
          sort_order: number
        }[]
      }
      gl_restaurant_rollup: {
        Args: {
          p_end_date: string
          p_organization_id: string
          p_start_date: string
        }
        Returns: {
          cogs_amount: number
          cogs_pct: number
          location_name: string
          operating_income: number
          operating_income_pct: number
          prime_cost_amount: number
          prime_cost_pct: number
          restaurant_id: string
          restaurant_name: string
          revenue: number
        }[]
      }
      ingest_daily_sales: {
        Args: { p_payload: Json; p_replace?: boolean; p_restaurant_id: string }
        Returns: Json
      }
      inventory_close_count_period: {
        Args: { p_count_period_id: string }
        Returns: {
          inventory_item_id: string
          variance_base_unit: number
          variance_value: number
        }[]
      }
      inventory_log_waste: {
        Args: {
          p_inventory_item_id: string
          p_notes?: string
          p_occurred_at?: string
          p_quantity_base_unit: number
          p_reason_code: string
          p_restaurant_id: string
        }
        Returns: string
      }
      inventory_menu_engineering: {
        Args: { p_restaurant_id: string }
        Returns: {
          category_name: string
          cost_pct: number
          is_costed: boolean
          item_id: string
          kind: string
          name: string
          over_target: boolean
          price: number
          target_pct: number
          theoretical_cost: number
        }[]
      }
      inventory_recipe_theoretical_cost: {
        Args: { p_cocktail_id?: string; p_menu_item_id?: string }
        Returns: number
      }
      inventory_reorder_suggestions: {
        Args: { p_restaurant_id: string }
        Returns: {
          current_quantity_base_unit: number
          inventory_item_id: string
          item_name: string
          par_level_quantity: number
          preferred_vendor_id: string
          preferred_vendor_item_id: string
          purchase_unit_id: string
          reorder_point: number
          suggested_order_quantity: number
          vendor_unit_cost: number
        }[]
      }
      is_head_bartender: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_owner_admin: { Args: never; Returns: boolean }
      is_same_org_restaurant: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      is_same_restaurant: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      plcb_ingest_order: {
        Args: { p_order: Json; p_restaurant_id: string }
        Returns: Json
      }
      receive_inventory_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      search_knowledge: {
        Args: { query: string }
        Returns: {
          entity_id: string
          entity_type: string
          snippet: string
          tags: string[]
          title: string
        }[]
      }
      seed_standard_coa: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      set_user_role_by_email: {
        Args: { new_role: string; target_email: string }
        Returns: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          preferred_name: string | null
          restaurant_id: string | null
          role: string
          team: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      to_base_unit_quantity: {
        Args: { p_item_id: string; p_quantity: number; p_unit_id: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
