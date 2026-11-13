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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      congestion_predictions: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          horizon_min: number
          id: string
          predicted_level: number
          probability: number
          risk_score: number
          road_code: string
        }
        Insert: {
          confidence: number
          created_at?: string
          created_by?: string | null
          horizon_min: number
          id?: string
          predicted_level: number
          probability: number
          risk_score: number
          road_code: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          horizon_min?: number
          id?: string
          predicted_level?: number
          probability?: number
          risk_score?: number
          road_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "congestion_predictions_road_code_fkey"
            columns: ["road_code"]
            isOneToOne: false
            referencedRelation: "roads"
            referencedColumns: ["code"]
          },
        ]
      }
      emergency_routes: {
        Row: {
          created_at: string
          destination: string
          emergency_eta_min: number
          id: string
          normal_eta_min: number
          path: Json
          source: string
          time_saved_min: number
          user_id: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          destination: string
          emergency_eta_min: number
          id?: string
          normal_eta_min: number
          path?: Json
          source: string
          time_saved_min: number
          user_id: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          destination?: string
          emergency_eta_min?: number
          id?: string
          normal_eta_min?: number
          path?: Json
          source?: string
          time_saved_min?: number
          user_id?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      incident_verifications: {
        Row: {
          created_at: string
          distance_m: number
          id: string
          incident_id: string
          note: string
          similarity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_m: number
          id?: string
          incident_id: string
          note?: string
          similarity: number
          user_id: string
        }
        Update: {
          created_at?: string
          distance_m?: number
          id?: string
          incident_id?: string
          note?: string
          similarity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_verifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          confidence: number
          created_at: string
          description: string
          estimated_severity: number | null
          id: string
          image_url: string | null
          is_demo: boolean
          lat: number
          lng: number
          location_name: string
          report_count: number
          reporter_id: string | null
          resolved_at: string | null
          road_code: string | null
          severity: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          description?: string
          estimated_severity?: number | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          lat: number
          lng: number
          location_name: string
          report_count?: number
          reporter_id?: string | null
          resolved_at?: string | null
          road_code?: string | null
          severity: number
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          description?: string
          estimated_severity?: number | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          lat?: number
          lng?: number
          location_name?: string
          report_count?: number
          reporter_id?: string | null
          resolved_at?: string | null
          road_code?: string | null
          severity?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      road_closures: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          reason: string
          road_code: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          reason?: string
          road_code: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          reason?: string
          road_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_closures_road_code_fkey"
            columns: ["road_code"]
            isOneToOne: false
            referencedRelation: "roads"
            referencedColumns: ["code"]
          },
        ]
      }
      roads: {
        Row: {
          base_load: number
          code: string
          created_at: string
          from_node: string
          id: string
          lanes: number
          name: string
          speed_limit: number
          to_node: string
        }
        Insert: {
          base_load: number
          code: string
          created_at?: string
          from_node: string
          id?: string
          lanes: number
          name: string
          speed_limit: number
          to_node: string
        }
        Update: {
          base_load?: number
          code?: string
          created_at?: string
          from_node?: string
          id?: string
          lanes?: number
          name?: string
          speed_limit?: number
          to_node?: string
        }
        Relationships: []
      }
      route_history: {
        Row: {
          created_at: string
          destination: string
          distance_km: number
          eta_min: number
          id: string
          path: Json
          route_kind: string
          score: number
          source: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          destination: string
          distance_km: number
          eta_min: number
          id?: string
          path?: Json
          route_kind: string
          score: number
          source: string
          user_id: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          destination?: string
          distance_km?: number
          eta_min?: number
          id?: string
          path?: Json
          route_kind?: string
          score?: number
          source?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      signal_simulations: {
        Row: {
          adaptive_avg_wait: number
          adaptive_processed: number
          created_at: string
          density_level: number
          fixed_avg_wait: number
          fixed_processed: number
          id: string
          improvement_pct: number
          junction: string
          user_id: string
        }
        Insert: {
          adaptive_avg_wait: number
          adaptive_processed: number
          created_at?: string
          density_level: number
          fixed_avg_wait: number
          fixed_processed: number
          id?: string
          improvement_pct: number
          junction: string
          user_id: string
        }
        Update: {
          adaptive_avg_wait?: number
          adaptive_processed?: number
          created_at?: string
          density_level?: number
          fixed_avg_wait?: number
          fixed_processed?: number
          id?: string
          improvement_pct?: number
          junction?: string
          user_id?: string
        }
        Relationships: []
      }
      simulation_scenarios: {
        Row: {
          created_at: string
          id: string
          name: string
          params: Json
          results: Json
          scenario_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          params?: Json
          results?: Json
          scenario_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          params?: Json
          results?: Json
          scenario_type?: string
          user_id?: string
        }
        Relationships: []
      }
      traffic_data: {
        Row: {
          avg_speed_kmh: number
          congestion: number
          id: string
          is_simulated: boolean
          recorded_at: string
          road_code: string
          vehicle_density: number
        }
        Insert: {
          avg_speed_kmh: number
          congestion: number
          id?: string
          is_simulated?: boolean
          recorded_at?: string
          road_code: string
          vehicle_density: number
        }
        Update: {
          avg_speed_kmh?: number
          congestion?: number
          id?: string
          is_simulated?: boolean
          recorded_at?: string
          road_code?: string
          vehicle_density?: number
        }
        Relationships: [
          {
            foreignKeyName: "traffic_data_road_code_fkey"
            columns: ["road_code"]
            isOneToOne: false
            referencedRelation: "roads"
            referencedColumns: ["code"]
          },
        ]
      }
      traffic_signals: {
        Row: {
          created_at: string
          cycle_seconds: number
          id: string
          lat: number
          lng: number
          mode: string
          name: string
          node_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_seconds?: number
          id?: string
          lat: number
          lng: number
          mode?: string
          name: string
          node_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_seconds?: number
          id?: string
          lat?: number
          lng?: number
          mode?: string
          name?: string
          node_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
