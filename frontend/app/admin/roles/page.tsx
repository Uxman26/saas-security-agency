import { redirect } from 'next/navigation';

// Platform roles moved into Team & roles, next to the super users they apply to.
export default function AdminRolesRedirect() {
  redirect('/admin/team');
}
