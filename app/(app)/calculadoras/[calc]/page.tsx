"use client";

import { notFound, useParams } from "next/navigation";
import type { ComponentType } from "react";
import { CalculadoraAtualizacao } from "@/components/calculadoras/atualizacao";
import { CalculadoraCustas } from "@/components/calculadoras/custas";
import { CalculadoraDosimetria } from "@/components/calculadoras/dosimetria";
import { CalculadoraExecucaoPenal } from "@/components/calculadoras/execucao-penal";
import { CalculadoraHonorarios } from "@/components/calculadoras/honorarios";
import { CalculadoraPorcentagem } from "@/components/calculadoras/porcentagem";
import { CalculadoraPrazos } from "@/components/calculadoras/prazos";
import { CalculadoraPrescricao } from "@/components/calculadoras/prescricao";
import { CalculadoraValorCausaTrabalhista } from "@/components/calculadoras/valor-causa-trabalhista";

const TELAS: Record<string, ComponentType> = {
  "valor-da-causa-trabalhista": CalculadoraValorCausaTrabalhista,
  prescricao: CalculadoraPrescricao,
  dosimetria: CalculadoraDosimetria,
  prazos: CalculadoraPrazos,
  porcentagem: CalculadoraPorcentagem,
  honorarios: CalculadoraHonorarios,
  atualizacao: CalculadoraAtualizacao,
  custas: CalculadoraCustas,
  "execucao-penal": CalculadoraExecucaoPenal,
};

export default function CalculadoraPage() {
  const { calc } = useParams<{ calc: string }>();
  const Tela = TELAS[calc];
  if (!Tela) notFound();
  return <Tela />;
}
