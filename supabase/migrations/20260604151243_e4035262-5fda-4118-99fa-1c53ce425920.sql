ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.send_requests;
ALTER TABLE public.copy_requests REPLICA IDENTITY FULL;
ALTER TABLE public.send_requests REPLICA IDENTITY FULL;