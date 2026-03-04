-- Recurring schedules: template + days of week + time; processor creates posts at next_run_at
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  tags text[] DEFAULT '{}',
  media_ids uuid[] DEFAULT '{}',
  platforms text[] NOT NULL,
  days_of_week smallint[] NOT NULL,
  time_local time NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  next_run_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recurring_schedules"
  ON recurring_schedules FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_next_run
  ON recurring_schedules(next_run_at)
  WHERE is_active = true;

-- Caption templates: save/load reusable captions
CREATE TABLE IF NOT EXISTS caption_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE caption_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own caption_templates"
  ON caption_templates FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_caption_templates_user_id ON caption_templates(user_id);
