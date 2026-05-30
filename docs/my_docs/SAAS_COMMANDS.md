update profiles
  set plan = 'active',
      plan_expires_at = '2030-01-01T00:00:00+00:00'
  where id = (select id from auth.users where email = 'ashekeinureke@gmail.com');

