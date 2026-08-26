import { Suspense } from 'react';
import ResultadosAccesoForm from './ResultadosAccesoForm';

export default function ResultadosAccesoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          Cargando...
        </div>
      }
    >
      <ResultadosAccesoForm />
    </Suspense>
  );
}
