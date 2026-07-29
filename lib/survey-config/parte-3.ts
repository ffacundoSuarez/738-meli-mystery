import { SurveySection } from '../types';
import {
  ESCALA_SATISFACCION,
  SI_NO_COD,
  evidenciasModule,
} from './constants';

// ============================================================
// PLACEHOLDER — Etapa 1
// Se reemplaza por el cuestionario real de Mercado Libre en la Etapa 2.
// ============================================================

export const parte3: SurveySection = {
  id: 'parte-3',
  title: 'Parte 3 — Cierre y valoración',
  titlePt: 'Parte 3 — Encerramento e avaliação',
  description: 'Entrega, posventa y valoración global de la experiencia.',
  descriptionPt: 'Entrega, pós-venda e avaliação global da experiência.',
  modules: [
    {
      id: 'cierre',
      title: 'Cierre',
      titlePt: 'Encerramento',
      questions: [
        {
          id: 'p30-fecha-cierre',
          text: 'P30. ¿En qué fecha se cerró la operación?',
          textPt: 'P30. Em que data foi encerrada a operação?',
          type: 'date',
          required: true,
        },
        {
          id: 'p31-plazo',
          text: 'P31. ¿Se cumplió el plazo informado?',
          textPt: 'P31. O prazo informado foi cumprido?',
          type: 'single',
          options: SI_NO_COD,
          required: true,
        },
        {
          id: 'p32-desvio',
          text: 'P32. ¿Cuántos días de desvío hubo?',
          textPt: 'P32. Quantos dias de desvio houve?',
          type: 'number',
          showIf: { questionId: 'p31-plazo', values: ['2'] },
          required: true,
        },
        {
          id: 'p33-posventa',
          text: 'P33. ¿Necesitó contactar a atención al cliente?',
          textPt: 'P33. Precisou de contactar o apoio ao cliente?',
          type: 'single',
          options: SI_NO_COD,
          required: true,
        },
        {
          id: 'p34-posventa-detalle',
          text: 'P34. Describa el motivo y cómo fue resuelto',
          textPt: 'P34. Descreva o motivo e como foi resolvido',
          type: 'longtext',
          showIf: { questionId: 'p33-posventa', values: ['1'] },
          required: true,
        },
      ],
    },
    {
      id: 'valoracion',
      title: 'Valoración global',
      titlePt: 'Avaliação global',
      questions: [
        {
          id: 'p40-satisfaccion',
          text: 'P40. En términos generales, ¿qué tan satisfecho quedó con la experiencia?',
          textPt: 'P40. Em termos gerais, quão satisfeito ficou com a experiência?',
          type: 'single',
          options: ESCALA_SATISFACCION,
          required: true,
        },
        {
          id: 'p41-nps',
          text: 'P41. Del 0 al 10, ¿qué tan probable es que recomiende esta plataforma?',
          textPt: 'P41. De 0 a 10, qual a probabilidade de recomendar esta plataforma?',
          type: 'scale',
          scaleMin: 0,
          scaleMax: 10,
          scaleMinLabel: 'Nada probable',
          scaleMinLabelPt: 'Nada provável',
          scaleMaxLabel: 'Muy probable',
          scaleMaxLabelPt: 'Muito provável',
          required: true,
        },
        {
          id: 'p42-mejora',
          text: 'P42. ¿Qué mejoraría de la experiencia?',
          textPt: 'P42. O que melhoraria na experiência?',
          type: 'longtext',
          required: true,
        },
      ],
    },
    evidenciasModule(3),
  ],
};
