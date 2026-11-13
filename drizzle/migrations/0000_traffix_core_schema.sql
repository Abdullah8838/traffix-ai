
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- New user: profile + role. The very first account becomes the city administrator.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Roads (mirror of the demo road graph)
CREATE TABLE public.roads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  from_node text NOT NULL,
  to_node text NOT NULL,
  lanes int NOT NULL CHECK (lanes > 0),
  speed_limit int NOT NULL CHECK (speed_limit > 0),
  base_load numeric(4,2) NOT NULL CHECK (base_load >= 0 AND base_load <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roads TO anon, authenticated;
GRANT ALL ON public.roads TO service_role;
ALTER TABLE public.roads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roads are public" ON public.roads FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.roads (code, name, from_node, to_node, lanes, speed_limit, base_load) VALUES
('e01','Hosur Road Elevated Expressway','EC','HR',6,80,0.35),
('e02','Hosur Road (Bommanahalli)','HR','SB',4,50,0.72),
('e03','Outer Ring Road (Silk Board–BTM)','SB','BTM',6,50,0.78),
('e04','Outer Ring Road (BTM–Banashankari)','BTM','BSK',4,50,0.55),
('e05','Outer Ring Road (Silk Board–HSR)','SB','HSR',6,50,0.82),
('e06','Outer Ring Road (HSR–Bellandur)','HSR','BEL',6,60,0.70),
('e07','Outer Ring Road (Bellandur–Marathahalli)','BEL','MAR',6,60,0.76),
('e08','Outer Ring Road (Marathahalli–KR Puram)','MAR','KRP',6,60,0.60),
('e09','Outer Ring Road (KR Puram–Kalyan Nagar)','KRP','KAL',6,60,0.55),
('e10','Outer Ring Road (Kalyan Nagar–Manyata)','KAL','MAN',6,60,0.58),
('e11','Outer Ring Road (Manyata–Hebbal)','MAN','HEB',6,60,0.66),
('e12','ITPL / Varthur Road','MAR','WF',4,50,0.65),
('e13','Old Madras Road (KR Puram–Whitefield)','KRP','WF',4,50,0.52),
('e14','Sarjapur Road','BEL','SAR',4,40,0.55),
('e15','Haralur Road','SAR','HR',2,40,0.45),
('e16','Sarjapur Main Road (HSR–Koramangala)','HSR','KOR',4,40,0.55),
('e17','Hosur Road (Silk Board–Koramangala)','SB','KOR',4,50,0.70),
('e18','Inner Ring Road','KOR','DOM',6,50,0.55),
('e19','100 Feet Road','DOM','IND',4,40,0.50),
('e20','Old Airport Road','DOM','MAR',4,50,0.65),
('e21','CMH Road – MG Road','IND','MG',4,40,0.55),
('e22','Old Madras Road (Indiranagar–Tin Factory)','IND','TF',6,50,0.60),
('e23','Old Madras Road (Tin Factory–KR Puram)','TF','KRP',6,50,0.72),
('e24','KG Road','MG','MAJ',4,40,0.65),
('e25','Richmond – Hosur Road','MG','KOR',4,40,0.60),
('e26','Lalbagh Road','MAJ','JAY',4,40,0.50),
('e27','Bannerghatta Road','JAY','BTM',4,40,0.55),
('e28','Kanakapura Road','JAY','BSK',4,40,0.45),
('e29','Seshadri – Palace Road','MAJ','MEK',4,40,0.50),
('e30','Bellary Road','MEK','HEB',6,60,0.60),
('e31','Cunningham Road','MG','MEK',4,40,0.48),
('e32','Banaswadi Main Road','KAL','TF',4,40,0.50);

-- Traffic signals (simulated junction controllers)
CREATE TABLE public.traffic_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_code text NOT NULL UNIQUE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  mode text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed','adaptive')),
  cycle_seconds int NOT NULL DEFAULT 90 CHECK (cycle_seconds BETWEEN 20 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.traffic_signals TO anon, authenticated;
GRANT UPDATE ON public.traffic_signals TO authenticated;
GRANT ALL ON public.traffic_signals TO service_role;
ALTER TABLE public.traffic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signals are public" ON public.traffic_signals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update signals" ON public.traffic_signals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER signals_touch BEFORE UPDATE ON public.traffic_signals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.traffic_signals (node_code, name, lat, lng, cycle_seconds) VALUES
('SB','Silk Board Junction',12.9177,77.6238,120),
('KOR','Koramangala Sony World Junction',12.9352,77.6245,90),
('MAR','Marathahalli Bridge Junction',12.9569,77.7011,110),
('HEB','Hebbal Flyover Junction',13.0358,77.5970,120),
('MG','MG Road – Trinity Junction',12.9756,77.6066,80),
('KRP','KR Puram Junction',13.0050,77.6960,110),
('BEL','Bellandur Junction',12.9260,77.6762,100),
('IND','Indiranagar 100 Ft Junction',12.9784,77.6408,90);

-- Incidents
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid,
  type text NOT NULL CHECK (type IN ('accident','roadblock','congestion','construction','flooding','signal_failure')),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_name text NOT NULL,
  road_code text,
  severity int NOT NULL CHECK (severity BETWEEN 1 AND 5),
  estimated_severity numeric(3,1),
  confidence numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','resolved')),
  report_count int NOT NULL DEFAULT 1 CHECK (report_count >= 1),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX incidents_status_idx ON public.incidents (status);
CREATE INDEX incidents_created_idx ON public.incidents (created_at DESC);
CREATE INDEX incidents_road_idx ON public.incidents (road_code);
GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Incidents are public" ON public.incidents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Signed-in users report incidents" ON public.incidents FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND status = 'pending' AND is_demo = false AND report_count = 1);
CREATE POLICY "Admins update incidents" ON public.incidents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete incidents" ON public.incidents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER incidents_touch BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Incident verifications (duplicate reports confirm an existing incident)
CREATE TABLE public.incident_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  similarity numeric(4,3) NOT NULL CHECK (similarity BETWEEN 0 AND 1),
  distance_m numeric NOT NULL CHECK (distance_m >= 0),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, user_id)
);
CREATE INDEX incident_verifications_incident_idx ON public.incident_verifications (incident_id);
GRANT SELECT ON public.incident_verifications TO anon, authenticated;
GRANT INSERT ON public.incident_verifications TO authenticated;
GRANT ALL ON public.incident_verifications TO service_role;
ALTER TABLE public.incident_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verifications are public" ON public.incident_verifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Signed-in users verify" ON public.incident_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.apply_incident_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.incidents
  SET report_count = report_count + 1,
      confidence = LEAST(0.98, confidence + 0.12 * NEW.similarity),
      status = CASE WHEN status = 'pending' AND report_count + 1 >= 3 THEN 'verified' ELSE status END
  WHERE id = NEW.incident_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER incident_verification_applied AFTER INSERT ON public.incident_verifications
  FOR EACH ROW EXECUTE FUNCTION public.apply_incident_verification();

-- Road closures
CREATE TABLE public.road_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_code text NOT NULL REFERENCES public.roads(code) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX road_closures_active_idx ON public.road_closures (active);
GRANT SELECT ON public.road_closures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.road_closures TO authenticated;
GRANT ALL ON public.road_closures TO service_role;
ALTER TABLE public.road_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Closures are public" ON public.road_closures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins create closures" ON public.road_closures FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update closures" ON public.road_closures FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete closures" ON public.road_closures FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.road_closures (road_code, reason) VALUES ('e15','Demo: metro pillar works, full carriageway closed');

-- Traffic data snapshots
CREATE TABLE public.traffic_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_code text NOT NULL REFERENCES public.roads(code) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  congestion numeric(4,3) NOT NULL CHECK (congestion BETWEEN 0 AND 1),
  vehicle_density int NOT NULL CHECK (vehicle_density >= 0),
  avg_speed_kmh numeric(5,1) NOT NULL CHECK (avg_speed_kmh >= 0),
  is_simulated boolean NOT NULL DEFAULT true
);
CREATE INDEX traffic_data_road_time_idx ON public.traffic_data (road_code, recorded_at DESC);
GRANT SELECT ON public.traffic_data TO anon, authenticated;
GRANT INSERT ON public.traffic_data TO authenticated;
GRANT ALL ON public.traffic_data TO service_role;
ALTER TABLE public.traffic_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Traffic data is public" ON public.traffic_data FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins record traffic data" ON public.traffic_data FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Congestion predictions snapshots
CREATE TABLE public.congestion_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_code text NOT NULL REFERENCES public.roads(code) ON DELETE CASCADE,
  horizon_min int NOT NULL CHECK (horizon_min BETWEEN 0 AND 120),
  predicted_level numeric(4,3) NOT NULL CHECK (predicted_level BETWEEN 0 AND 1),
  probability numeric(4,3) NOT NULL CHECK (probability BETWEEN 0 AND 1),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  risk_score int NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX congestion_predictions_created_idx ON public.congestion_predictions (created_at DESC);
GRANT SELECT ON public.congestion_predictions TO anon, authenticated;
GRANT INSERT, DELETE ON public.congestion_predictions TO authenticated;
GRANT ALL ON public.congestion_predictions TO service_role;
ALTER TABLE public.congestion_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Predictions are public" ON public.congestion_predictions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins record predictions" ON public.congestion_predictions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete predictions" ON public.congestion_predictions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Per-user histories
CREATE TABLE public.route_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  destination text NOT NULL,
  vehicle_type text NOT NULL,
  route_kind text NOT NULL CHECK (route_kind IN ('shortest','fastest','ai')),
  distance_km numeric(6,2) NOT NULL,
  eta_min numeric(6,1) NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX route_history_user_idx ON public.route_history (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.route_history TO authenticated;
GRANT ALL ON public.route_history TO service_role;
ALTER TABLE public.route_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own route history" ON public.route_history FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert own route history" ON public.route_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own route history" ON public.route_history FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.signal_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  junction text NOT NULL,
  density_level int NOT NULL,
  fixed_avg_wait numeric(7,2) NOT NULL,
  adaptive_avg_wait numeric(7,2) NOT NULL,
  fixed_processed int NOT NULL,
  adaptive_processed int NOT NULL,
  improvement_pct numeric(6,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.signal_simulations TO authenticated;
GRANT ALL ON public.signal_simulations TO service_role;
ALTER TABLE public.signal_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own signal sims" ON public.signal_simulations FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert own signal sims" ON public.signal_simulations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own signal sims" ON public.signal_simulations FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.emergency_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('ambulance','fire','response')),
  source text NOT NULL,
  destination text NOT NULL,
  normal_eta_min numeric(6,1) NOT NULL,
  emergency_eta_min numeric(6,1) NOT NULL,
  time_saved_min numeric(6,1) NOT NULL,
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.emergency_routes TO authenticated;
GRANT ALL ON public.emergency_routes TO service_role;
ALTER TABLE public.emergency_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own emergency routes" ON public.emergency_routes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert own emergency routes" ON public.emergency_routes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own emergency routes" ON public.emergency_routes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.simulation_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  scenario_type text NOT NULL CHECK (scenario_type IN ('closure','accident','density','emergency','signals')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX simulation_scenarios_user_idx ON public.simulation_scenarios (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.simulation_scenarios TO authenticated;
GRANT ALL ON public.simulation_scenarios TO service_role;
ALTER TABLE public.simulation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own scenarios" ON public.simulation_scenarios FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert own scenarios" ON public.simulation_scenarios FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete scenarios" ON public.simulation_scenarios FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'info' CHECK (kind IN ('info','success','warning','alert')),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_incident_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (NEW.reporter_id, 'Report received', 'Your ' || replace(NEW.type,'_',' ') || ' report at ' || NEW.location_name || ' is awaiting review.', 'info');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (NEW.reporter_id, 'Incident ' || NEW.status, 'Your report at ' || NEW.location_name || ' was marked ' || NEW.status || '.',
      CASE NEW.status WHEN 'rejected' THEN 'warning' ELSE 'success' END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER incident_notify AFTER INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.notify_incident_change();

-- Demo incidents
INSERT INTO public.incidents (type, lat, lng, location_name, road_code, severity, estimated_severity, confidence, description, status, report_count, is_demo, created_at) VALUES
('accident', 12.9172, 77.6300, 'Silk Board – ORR towards HSR', 'e05', 4, 4.2, 0.86, 'Two-car collision blocking the left lane near the flyover ramp.', 'verified', 3, true, now() - interval '25 minutes'),
('construction', 12.9420, 77.6900, 'ORR near Ecospace, Bellandur', 'e07', 3, 2.8, 0.92, 'Storm-water drain works narrowing carriageway to two lanes.', 'verified', 4, true, now() - interval '3 hours'),
('flooding', 12.9560, 77.6990, 'Marathahalli Bridge underpass', 'e08', 4, 3.9, 0.74, 'Water-logging after heavy rain, vehicles moving slowly.', 'verified', 2, true, now() - interval '50 minutes'),
('signal_failure', 12.9360, 77.6260, 'Sony World Junction, Koramangala', 'e18', 2, 2.4, 0.61, 'Signal blinking amber, manual control by police.', 'pending', 1, true, now() - interval '15 minutes'),
('congestion', 13.0030, 77.6900, 'KR Puram Hanging Bridge', 'e23', 3, 3.1, 0.68, 'Heavy queue on the Old Madras Road approach.', 'pending', 2, true, now() - interval '10 minutes'),
('roadblock', 13.0300, 77.5960, 'Hebbal flyover service road', 'e30', 3, 3.0, 0.55, 'Broken-down bus blocking the service road.', 'resolved', 2, true, now() - interval '6 hours');

-- Storage policies for incident photos (bucket created separately)
CREATE POLICY "Incident photos are public" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'incident-images');
CREATE POLICY "Users upload own incident photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'incident-images' AND (storage.foldername(name))[1] = auth.uid()::text);
