update public.profiles as p
set display_name = 'NOMVRE'
from auth.users as u
where p.id = u.id
  and u.email = 'correo@node.com';