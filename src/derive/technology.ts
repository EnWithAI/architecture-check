// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Technology families: container image references → family, and declared technology text → families. Used for the
 * as-built technology and for `technology-mismatch` (a hypothesis: multi-stage builds and sidecars blur it).
 */

/** A technology family with the image name prefixes that indicate it and the words that name it in a model. */
interface Family {
  name: string;
  images: string[];
  words: string[];
  datastore: boolean;
}

const FAMILIES: Family[] = [
  {
    name: "Node.js",
    images: ["node", "nodejs"],
    words: [
      "node",
      "node.js",
      "nodejs",
      "typescript",
      "javascript",
      "express",
      "nestjs",
      "fastify",
      "next.js",
      "nextjs",
    ],
    datastore: false,
  },
  {
    name: "Python",
    images: ["python", "pypy"],
    words: ["python", "django", "flask", "fastapi"],
    datastore: false,
  },
  {
    name: "Java",
    images: ["openjdk", "eclipse-temurin", "amazoncorretto", "maven", "gradle", "ibmjava", "tomcat"],
    words: ["java", "spring", "kotlin", "jvm", "quarkus", "micronaut"],
    datastore: false,
  },
  { name: "Go", images: ["golang"], words: ["go", "golang"], datastore: false },
  {
    name: ".NET",
    images: ["dotnet"],
    words: [".net", "dotnet", "c#", "asp.net", "csharp"],
    datastore: false,
  },
  { name: "Ruby", images: ["ruby"], words: ["ruby", "rails"], datastore: false },
  { name: "PHP", images: ["php"], words: ["php", "laravel", "symfony"], datastore: false },
  { name: "Rust", images: ["rust"], words: ["rust"], datastore: false },
  { name: "Nginx", images: ["nginx"], words: ["nginx"], datastore: false },
  { name: "PostgreSQL", images: ["postgres", "postgis"], words: ["postgres", "postgresql"], datastore: true },
  { name: "MySQL", images: ["mysql"], words: ["mysql"], datastore: true },
  { name: "MariaDB", images: ["mariadb"], words: ["mariadb"], datastore: true },
  { name: "MongoDB", images: ["mongo", "mongodb"], words: ["mongo", "mongodb"], datastore: true },
  { name: "Redis", images: ["redis", "valkey"], words: ["redis", "valkey"], datastore: true },
  { name: "RabbitMQ", images: ["rabbitmq"], words: ["rabbitmq", "amqp"], datastore: false },
  { name: "Kafka", images: ["kafka", "cp-kafka"], words: ["kafka"], datastore: false },
  { name: "Elasticsearch", images: ["elasticsearch"], words: ["elasticsearch"], datastore: true },
];

/** Repository path of an image reference without registry, tag or digest (e.g. `library/node`). */
function imagePath(image: string): string {
  let ref = image.trim().toLowerCase();
  ref = ref.replace(/@sha256:[0-9a-f]+$/, "");
  const parts = ref.split("/");
  if (parts.length > 1 && /[.:]|^localhost$/.test(parts[0] as string)) parts.shift();
  const last = (parts.pop() as string).replace(/:[^:/]*$/, "");
  return [...parts, last].join("/");
}

/** The technology family of an image reference, or null when unknown or variable. */
export function familyOfImage(image: string): string | null {
  if (image.includes("$")) return null;
  const segments = imagePath(image).split("/");
  for (const family of FAMILIES) {
    for (const seg of segments) {
      if (family.images.some((p) => seg === p || (seg.startsWith(p) && /^[0-9-]/.test(seg.slice(p.length)))))
        return family.name;
    }
  }
  return null;
}

/** True when the family is a data store (CALM node type `database`). */
export function isDatastore(family: string | null): boolean {
  return FAMILIES.some((f) => f.name === family && f.datastore);
}

/** Families named in a declared technology text (token match, so "Django" does not match "Go"). */
export function familiesOfText(text: string): string[] {
  const tokens = new Set(
    text
      .toLowerCase()
      .split(/[\s,/;()+|&]+/)
      .flatMap((t) => [t, ...t.split("-")])
      .filter(Boolean)
  );
  return FAMILIES.filter((f) => f.words.some((w) => tokens.has(w))).map((f) => f.name);
}
