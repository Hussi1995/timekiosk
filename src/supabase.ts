import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qzkgpbtbtslvmmlpgnkr.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a2dwYnRidHNsdm1tbHBnbmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjg3NjYsImV4cCI6MjA5MTY0NDc2Nn0.zGSfxcgJ0ti2lOT_fvSzvTX3EMzWjN3-m6aw8_oWw1Q";
export const supabase = createClient(supabaseUrl, supabaseKey);