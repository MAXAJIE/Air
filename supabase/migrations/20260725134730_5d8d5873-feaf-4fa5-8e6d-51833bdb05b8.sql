REVOKE EXECUTE ON FUNCTION public.save_my_pii(text,text,text,text,text,text,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pii(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_pii(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_pii(text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pii(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_pii(uuid) TO authenticated;