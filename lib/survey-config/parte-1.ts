import { SurveySection } from '../types';
import {
  CANALES,
  CATEGORIAS,
  ESCALA_5,
  MARCAS,
  PAISES,
  REGIONES,
  SI_CAT_COMPRADOR,
  SI_CAT_VENDEDOR,
  SI_MARCA_OTRA,
  SI_NO_COD,
  SI_NO_MATRIX,
  evidenciasModule,
} from './constants';

// ============================================================
// PLACEHOLDER — Etapa 1
// Estructura de ejemplo para validar el flujo end-to-end.
// Se reemplaza por el cuestionario real de Mercado Libre en la Etapa 2.
// ============================================================

export const parte1: SurveySection = {
  id: 'parte-1',
  title: 'Parte 1 — Screening y primer contacto',
  titlePt: 'Parte 1 — Triagem e primeiro contacto',
  description: 'Datos de encuadre del caso y primera impresión de la experiencia.',
  descriptionPt: 'Dados de enquadramento do caso e primeira impressão da experiência.',
  modules: [
    {
      id: 'screening',
      title: 'Screening',
      titlePt: 'Triagem',
      description: 'Estas preguntas definen el encuadre del caso.',
      descriptionPt: 'Estas perguntas definem o enquadramento do caso.',
      questions: [
        {
          id: 'f1-pais',
          text: 'F1. ¿En qué país realizó la evaluación?',
          textPt: 'F1. Em que país realizou a avaliação?',
          type: 'single',
          options: PAISES,
          required: true,
          hint: 'Precargado al generar el link. Verifique que sea correcto.',
          hintPt: 'Pré-carregado ao gerar o link. Verifique se está correto.',
        },
        {
          id: 'f2-region',
          text: 'F2. ¿En qué región o ciudad?',
          textPt: 'F2. Em que região ou cidade?',
          type: 'single',
          options: REGIONES,
          required: true,
          // El motor soporta descalificación silenciosa con terminateIf, p.ej.:
          //   terminateIf: { questionId: 'f2-region', values: ['otro'] }
          // No se activa en el placeholder: cortaría el flujo de prueba
          // (responder → enviar → revisar → aprobar). Se define con el
          // cuestionario real, en las preguntas que correspondan.
        },
        {
          id: 'f3-marca',
          text: 'F3. ¿Sobre qué producto del ecosistema realizó la evaluación?',
          textPt: 'F3. Sobre que produto do ecossistema realizou a avaliação?',
          type: 'single',
          options: MARCAS,
          required: true,
        },
        {
          id: 'f3-marca-otra',
          text: 'F3b. ¿Cuál?',
          textPt: 'F3b. Qual?',
          type: 'text',
          showIf: SI_MARCA_OTRA,
          required: true,
        },
        {
          id: 'f4-categoria',
          text: 'F4. ¿Desde qué rol realizó la evaluación?',
          textPt: 'F4. A partir de que papel realizou a avaliação?',
          type: 'single',
          options: CATEGORIAS,
          required: true,
        },
        {
          id: 'f5-canal',
          text: 'F5. ¿Por qué canal?',
          textPt: 'F5. Por que canal?',
          type: 'single',
          options: CANALES,
          required: true,
        },
      ],
    },
    {
      id: 'primer-contacto',
      title: 'Primer contacto',
      titlePt: 'Primeiro contacto',
      questions: [
        {
          id: 'p1-fecha-hora',
          text: 'P1. ¿Cuándo realizó el primer contacto?',
          textPt: 'P1. Quando realizou o primeiro contacto?',
          type: 'datetime',
          required: true,
        },
        {
          id: 'p2-busqueda',
          text: 'P2. ¿Encontró fácilmente lo que buscaba?',
          textPt: 'P2. Encontrou facilmente o que procurava?',
          type: 'single',
          options: SI_NO_COD,
          required: true,
        },
        {
          id: 'p3-dificultad',
          text: 'P3. Describa qué dificultad tuvo',
          textPt: 'P3. Descreva que dificuldade teve',
          type: 'longtext',
          showIf: { questionId: 'p2-busqueda', values: ['2'] },
          required: true,
        },
        {
          id: 'p4-elementos',
          text: 'P4. ¿La publicación mostraba los siguientes elementos?',
          textPt: 'P4. A publicação mostrava os seguintes elementos?',
          type: 'matrix',
          matrixColumns: SI_NO_MATRIX,
          matrixRows: [
            { id: 'fotos', label: 'Fotos claras del producto', labelPt: 'Fotos claras do produto' },
            { id: 'precio', label: 'Precio visible', labelPt: 'Preço visível' },
            { id: 'envio', label: 'Costo y plazo de envío', labelPt: 'Custo e prazo de envio' },
            {
              id: 'reputacion',
              label: 'Reputación del vendedor',
              labelPt: 'Reputação do vendedor',
              showIf: SI_CAT_COMPRADOR,
            },
            {
              id: 'comisiones',
              label: 'Detalle de comisiones',
              labelPt: 'Detalhe de comissões',
              showIf: SI_CAT_VENDEDOR,
            },
          ],
          required: true,
        },
        {
          id: 'p5-primera-impresion',
          text: 'P5. ¿Cómo calificaría su primera impresión general?',
          textPt: 'P5. Como classificaria a sua primeira impressão geral?',
          type: 'single',
          options: ESCALA_5,
          required: true,
        },
      ],
    },
    evidenciasModule(1),
  ],
};
