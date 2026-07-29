import { redirect } from 'next/navigation';

// Ya no se ingresa ID manualmente — los links se generan desde el panel
export default function EncuestaEntryPage() {
  redirect('/acceso?redirect=/dashboard/postulantes');
}
