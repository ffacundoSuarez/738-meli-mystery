import { SurveyForm } from '@/components/survey/SurveyForm';

// Encuesta del postulante — acceso por token secreto en la URL
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SurveyForm accessToken={decodeURIComponent(id)} />;
}
