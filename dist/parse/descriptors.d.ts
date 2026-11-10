/** A reference from one container to a host name or service, with its location. */
export interface HostReference {
    variable: string;
    host: string;
    line: number;
}
/** A compose service. */
export interface ComposeService {
    file: string;
    name: string;
    line: number;
    buildContext: string | null;
    dockerfile: string | null;
    image: string | null;
    imageLine: number;
    dependsOn: {
        name: string;
        line: number;
        label: "depends_on" | "links";
    }[];
    hosts: HostReference[];
}
/** A Kubernetes workload (Deployment, StatefulSet, DaemonSet, Job, CronJob). */
export interface K8sWorkload {
    file: string;
    name: string;
    line: number;
    labels: Record<string, string>;
    image: string | null;
    imageLine: number;
    hosts: HostReference[];
}
/** A Kubernetes Service with a label selector. */
export interface K8sService {
    file: string;
    name: string;
    selector: Record<string, string>;
}
/** An API description document. */
export interface ApiDocument {
    file: string;
    format: "openapi" | "asyncapi";
    version: string;
    line: number;
}
/** The host named by a configuration value (`scheme://[user@]host[:port]…` or `host:port`), lower case, or null. */
export declare function hostOf(value: string): string | null;
/** Reads the services of a compose file; null when it cannot be parsed. */
export declare function readCompose(file: string, text: string): ComposeService[] | null;
/** Kubernetes workloads, Services and API descriptions found in one YAML/JSON file. */
export interface YamlContent {
    workloads: K8sWorkload[];
    services: K8sService[];
    apis: ApiDocument[];
}
/** Reads Kubernetes resources and API descriptions from a YAML or JSON file; null when it cannot be parsed. */
export declare function readYamlContent(file: string, text: string): YamlContent | null;
