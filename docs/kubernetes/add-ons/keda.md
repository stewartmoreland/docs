# KEDA (Kubernetes Event Driven Autoscaling)

<p align="center">
  <img src="https://github.com/kedacore/keda/blob/main/images/logos/keda-word-colour.png?raw=true" />
</p>

KEDA (Kubernetes-based Event Driven Autoscaler) extends HPA features to enable resource scaling based on events both within and external to the cluster.

## ScaledObjects

KEDA uses a custom resource definition known as a `ScaledObject` resource. ScaledObjects can have one or more triggers and reference a variety of Kubernetes resource types, such as deployments, stateful sets, and even other custom resources.

Each ScaledObject is comprised of two essential components; the `scaleTargetRef` to define what resource is to be scaled, and the `triggers` to define what events on which we would like the resource to scale.

### scaleTargetRef

Four keys are provided in the content for the `scaleTargetRef`. The only required key here is the `name` of the resource you wish to scale. This resource must be contained in the same namespace to which you deploy the `ScaledObject`. 

The `apiVersion`, `kind`, and `envSourceContainerName` are all optional, unless you want to scale a resource other than a common Kubernetes `deployment`.

!!!example
    ```yaml
    spec:
      scaleTargetRef:
        apiVersion:    {api-version-of-target-resource}  # Optional. Default: apps/v1
        kind:          {kind-of-target-resource}         # Optional. Default: Deployment
        name:          {name-of-target-resource}         # Mandatory. Must be in the same namespace as the ScaledObject
        envSourceContainerName: {container-name}         # Optional. Default: .spec.template.spec.containers[0]
    ```

### triggers

The `triggers` for a ScaledObject can contain common Kubernetes metrics such as cpu and memory resource consumption. While helpful the true benefit of a ScaledObject is the ability to query external metrics and events for scaling your resources. KEDA provides scalers from a wide variety of services and most will have their own parameters. It is recommended to view a list of [currently available scalers](https://keda.sh/docs/2.8/scalers/) as new scalers are added frequently with sequential updates.

### Optional Parameters

Other optional parameters are available to better tune the scale events to meet the requirements of your application. For more detail on these parameters, see the [ScaledObject Spec documentation](https://keda.sh/docs/2.8/concepts/scaling-deployments/#scaledobject-spec). 

!!!example
    ```yaml
    spec:
      scaleTargetRef:
        apiVersion:    {api-version-of-target-resource}  # Optional. Default: apps/v1
        kind:          {kind-of-target-resource}         # Optional. Default: Deployment
        name:          {name-of-target-resource}         # Mandatory. Must be in the same namespace as the ScaledObject
        envSourceContainerName: {container-name}         # Optional. Default: .spec.template.spec.containers[0]
      pollingInterval:  30                               # Optional. Default: 30 seconds
      cooldownPeriod:   300                              # Optional. Default: 300 seconds
      idleReplicaCount: 0                                # Optional. Default: ignored, must be less than minReplicaCount 
      minReplicaCount:  1                                # Optional. Default: 0
      maxReplicaCount:  100                              # Optional. Default: 100
      fallback:                                          # Optional. Section to specify fallback options
        failureThreshold: 3                              # Mandatory if fallback section is included
        replicas: 6                                      # Mandatory if fallback section is included
      advanced:                                          # Optional. Section to specify advanced options
        restoreToOriginalReplicaCount: true/false        # Optional. Default: false
        horizontalPodAutoscalerConfig:                   # Optional. Section to specify HPA related options
          name: {name-of-hpa-resource}                   # Optional. Default: keda-hpa-{scaled-object-name}
          behavior:                                      # Optional. Use to modify HPA's scaling behavior
            scaleDown:
              stabilizationWindowSeconds: 300
              policies:
              - type: Percent
                value: 100
                periodSeconds: 15
      triggers:
      ...
    ```

## Examples

### AWS CloudWatch Triggers for SQS queue length

To give an basic example of triggering scale events, we'll use CloudWatch Metrics to query queue length for a given SQS queue. In the example below, KEDA will trigger a scale event if the `ApproximateNumberOfMessagesVisible` holds above the `targetMetricValue` for longer than the `metricStatPeriod` and `metricCollectionTime`.

The `identityOwner` specifies which resource maintains the credentials required to query the CloudWatch Metrics API. Ideally, this parameter should be set to `operator`, as the KEDA Operator should be configured with the appropriate permissions to query CloudWatch Metrics.

The `expression` parameter allows you to use direct expression syntax the same as you would in the AWS CloudWatch Metrics console, without the need to provide `dimensionName` or `dimensionValue` parameters. It also enables you to perform more complex queries to attain the values you wish to use when scaling your resources.

!!!example
    ```yaml
    triggers:
    - type: aws-cloudwatch
      metadata:
        namespace: AWS/SQS # Required: namespace
        dimensionName: QueueName # Required if not using expression query
        dimensionValue: keda # Required if not using expression query
        # Optional: Expression query - Required if not using dimension name & value
        expression: SELECT MAX("ApproximateNumberOfMessagesVisible") FROM "AWS/SQS" WHERE QueueName = 'keda'
        metricName: ApproximateNumberOfMessagesVisible
        targetMetricValue: "2.1"
        minMetricValue: "1.5"
        awsRegion: "eu-west-1" # Required: region
        awsAccessKeyIDFromEnv: AWS_ACCESS_KEY_ID # Optional: AWS Access Key ID, can use TriggerAuthentication as well (default AWS_ACCESS_KEY_ID)
        awsSecretAccessKeyFromEnv: AWS_SECRET_ACCESS_KEY # Optional: AWS Secret Access Key, can use TriggerAuthentication as well (default AWS_SECRET_ACCESS_KEY)
        identityOwner: pod | operator # Optional. Default: pod
        metricCollectionTime: "300" # Optional: Collection Time (default 300)
        metricStat: "Average" # Optional: Metric Statistic (default "Average")
        metricStatPeriod: "300" # Optional: Metric Statistic Period (default 300)
        metricUnit: "Count" # Optional: Metric Unit (default "")
        metricEndTimeOffset: "60" # Optional: Metric EndTime Offset (default 0)
    ```

For more detail on the use of the other optional trigger parameters, see the proper documentation for the [aws-cloudwatch scaler](https://keda.sh/docs/2.8/scalers/aws-cloudwatch/).

### TargetGroup Latency

In this example, we will scale an application by evaluating TargetGroup metrics queried from CloudWatch. The challenge here is that target groups created by the AWS Load Balancer Controller will have unique IDs applied as a suffix to the name, making it unpredictable when deploying a new ingress resource. To compute these values, we will use the `lookup()` function provided by Helm to query the Kubernetes API and pass our target group name to the proper trigger query in the `ScaledObject` manifest.

To start, at the beginning of your `ScaledObject` template, query a list of deployed `TargetGroupBindings` using the `lookup()` function and store the results to a new variable.

!!!example
    ```yaml
    {{- $targetGroups := (lookup "elbv2.k8s.aws/v1beta1" "TargetGroupBinding" "" "").items }}
    ```

Once you have the list stored, you can later recall this list by searching for the service name that matches the `deployment` from your `scaleTargetRef`.

!!!example
    ```yaml
      {{- range $index, $group := $targetGroups }}
      {{- if eq .spec.serviceRef.name ( printf "%s-%s" $root.Release.Name $app ) }}
      dimensionValue: {{ .metadata.name }}
      {{- end }}
      {{- end }}
    ```

Once deployed, Helm will query the Kubernetes API to retrieve the list of TargetGroupBindings, and fill the `dimensionValue` with the matching target group name provided it is able to find a viable match.

Below is a full Helm template of the `ScaledObject` manifest for reference.

!!!example
    ```yaml
    {{- $root := . }}
    {{- if .Values.autoscaler.enabled }}
    {{- if $root.Capabilities.APIVersions.Has "keda.sh/v1alpha1" }}
    apiVersion: keda.sh/v1alpha1
    kind: ScaledObject
    metadata:
      name: {{ $root.Release.Name }}
      namespace: {{ $root.Release.Namespace }}
      labels:
        {{- include "my-chart.labels" . | nindent 4 }}
    spec:
      scaleTargetRef:
        name: {{ .Values.autoscaler.scaleTargetRef.name | default ( include "my-chart.fullname" . )  }}
        kind: {{ .Values.autoscaler.scaleTargetRef.type | default "Deployment" }}
      pollingInterval:  {{ .Values.autoscaler.pollingInterval | default 30 }}
      cooldownPeriod:   {{ .Values.autoscaler.cooldownPeriod | default 300 }}
      idleReplicaCount: {{ .Values.autoscaler.idleReplicaCount | default 1 }}
      minReplicaCount:  {{ .Values.autoscaler.minReplicaCount | default 3 }}
      maxReplicaCount:  {{ .Values.autoscaler.maxReplicaCount | default 100 }}
      fallback:
        failureThreshold: {{ .Values.autoscaler.fallback.failureThreshold | default 3 }}
        replicas: {{ .Values.autoscaler.fallback.replicas | default 5 }}
      advanced:
        restoreToOriginalReplicaCount: true
        horizontalPodAutoscalerConfig:
          behavior:
            scaleDown:
              stabilizationWindowSeconds: 300
              policies:
              - type: Percent
                value: 100
                periodSeconds: 15
      triggers:
      {{- with .Values.autoscaler.triggers }}
      {{ toYaml . | nindent 2 }}
      {{- end }}
      {{- with .Values.autoscaler.alb_metric }}
      {{- $targetGroups := (lookup "elbv2.k8s.aws/v1beta1" "TargetGroupBinding" "" "").items }}
        {{- range $index, $group := $targetGroups }}
        {{- if eq .spec.serviceRef.name ( include "my-chart.fullname" $root ) }}
        - type: aws-cloudwatch
          metadata:
            namespace: AWS/ApplicationELB
            dimensionName: TargetGroup
            dimensionValue: {{ .metadata.name }}
            metricName: TargetResponseTime
            targetMetricValue: {{ quote .Values.autoscaler.targetMetricValue | default "100"}}
            minMetricValue: {{ quote .Values.autoscaler.minMetricValue | default "0" }}
            awsRegion: {{ .Values.autoscaler.awsRegion | default "us-east-1" }}
            identityOwner: operator
        {{- end }}
        {{- end }}
      {{- end }}
      {{- end }}

    ---
    {{- end }}
    ```
