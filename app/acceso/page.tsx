import { Suspense } from 'react';
import AccesoPage from './AccesoForm';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          Cargando...
        </div>
      }
    >
      <AccesoPage />
    </Suspense>
  );
}
