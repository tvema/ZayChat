"use client";

import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  index: number;
}

export function FeatureCard({ name, description, icon: Icon, index }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="flex flex-col rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md"
    >
      <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
        <div className="rounded-lg bg-emerald-50 p-2">
          <Icon className="h-5 w-5 flex-none text-emerald-600" aria-hidden="true" />
        </div>
        {name}
      </dt>
      <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
        <p className="flex-auto">{description}</p>
      </dd>
    </motion.div>
  );
}
