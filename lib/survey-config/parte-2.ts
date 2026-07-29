import { SurveySection } from '../types';
import {
  ESCALA_5,
  SI_CANAL_APP,
  SI_NO_COD,
  SI_NO_MATRIX,
  evidenciasModule,
} from './constants';

// ============================================================
// PLACEHOLDER — Etapa 1
// Se reemplaza por el cuestionario real de Mercado Libre en la Etapa 2.
// ============================================================

export const parte2: SurveySection = {
  id: 'parte-2',
  title: 'Parte 2 — Proceso de compra',
  titlePt: 'Parte 2 — Processo de compra',
  description: 'Desarrollo de la operación, pago y comunicación con la contraparte.',
  descriptionPt: 'Desenvolvimento da operação, pagamento e comunicação com a contraparte.',
  modules: [
    {
      id: 'operacion',
      title: 'La operación',
      titlePt: 'A operação',
      questions: [
        {
          id: 'p10-completo',
          text: 'P10. ¿Pudo completar la operación?',
          textPt: 'P10. Conseguiu concluir a operação?',
          type: 'single',
          options: SI_NO_COD,
          required: true,
        },
        {
          id: 'p11-motivo-no',
          text: 'P11. ¿Por qué no pudo completarla?',
          textPt: 'P11. Porque não conseguiu concluí-la?',
          type: 'longtext',
          showIf: { questionId: 'p10-completo', values: ['2'] },
          required: true,
        },
        {
          id: 'p12-pasos',
          text: 'P12. ¿Cuántos pasos le tomó completar la operación?',
          textPt: 'P12. Quantos passos demorou a concluir a operação?',
          type: 'number',
          showIf: { questionId: 'p10-completo', values: ['1'] },
          required: true,
        },
        {
          id: 'p13-medios-pago',
          text: 'P13. ¿Qué medios de pago se ofrecieron?',
          textPt: 'P13. Que meios de pagamento foram oferecidos?',
          type: 'multiple',
          options: [
            { value: '1', label: 'Tarjeta de crédito', labelPt: 'Cartão de crédito' },
            { value: '2', label: 'Tarjeta de débito', labelPt: 'Cartão de débito' },
            { value: '3', label: 'Dinero en cuenta', labelPt: 'Dinheiro em conta' },
            { value: '4', label: 'Transferencia bancaria', labelPt: 'Transferência bancária' },
            { value: '5', label: 'Efectivo / puntos de pago', labelPt: 'Dinheiro / pontos de pagamento' },
          ],
          required: true,
        },
      ],
    },
    {
      id: 'comunicacion',
      title: 'Comunicación',
      titlePt: 'Comunicação',
      questions: [
        {
          id: 'p20-atencion',
          text: 'P20. Durante el proceso, ¿ocurrió lo siguiente?',
          textPt: 'P20. Durante o processo, ocorreu o seguinte?',
          type: 'matrix',
          matrixColumns: SI_NO_MATRIX,
          matrixRows: [
            {
              id: 'respuesta-rapida',
              label: 'Recibió respuesta en menos de 24 horas',
              labelPt: 'Recebeu resposta em menos de 24 horas',
            },
            {
              id: 'info-clara',
              label: 'La información fue clara y completa',
              labelPt: 'A informação foi clara e completa',
            },
            {
              id: 'notificaciones',
              label: 'Recibió notificaciones push del estado',
              labelPt: 'Recebeu notificações push do estado',
              showIf: SI_CANAL_APP,
            },
          ],
          required: true,
        },
        {
          id: 'p21-claridad',
          text: 'P21. ¿Cómo calificaría la claridad de la comunicación?',
          textPt: 'P21. Como classificaria a clareza da comunicação?',
          type: 'single',
          options: ESCALA_5,
          required: true,
        },
        {
          id: 'p22-comentario',
          text: 'P22. Comentarios adicionales sobre esta etapa',
          textPt: 'P22. Comentários adicionais sobre esta etapa',
          type: 'longtext',
        },
      ],
    },
    evidenciasModule(2),
  ],
};
