# Karpenter

<p align="center">
  <img src="https://raw.githubusercontent.com/aws/karpenter/main/website/static/banner.png" />
</p>

Karpenter is a cluster autoscaling alternative that optimizes performance, rapid scaling, and cost efficiency.

## FAQs

### Q: Does Karpenter need multiple "Proivders"?

* Karpenter supports using multiple Provisioners but can be used with a single "default" Provisioner resource. Provisioners can be thought of as NodeGroups in this case. If there's a need for specific compute resources such as inference acceleration or ARM (Graviton) process architectures, additional Provisioners can be deployed and used with specific label selectors or taints.
* One AWSNodeTemplate (provider) can support many Provisioners. If there is a need for unique instance roles, AMIs, tags, subnets, security groups, etc, multiple AWSNodeTemplates can be applied and referenced by their respective Provisioners in a one to many relative configuration.

### Q: Does Karpenter need "Node Termination Handler" with spot instances?

* Karpenter uses its own node termination handling through EventBridge notifications for ScheduledChange, Rebalance, SpotInterruption, and InstanceStateChange. These EventBridge notifications are forwarded to an SQS queue (KarpenterInterruptionQueue). Karpenter then receives this notification, provisions new instances as required, and gracefully terminates the pods through the standard sigterm / sigkill termination flow before the instance is terminated.
* It's therefore not recommended to use the AWS Node Termination Handler in conjunction with Karpenter.

### Q: How do we migrate from Cluster Auto scaler to Karpenter in Prod without service disruption?

1. Once Karpenter and all required dependencies have been deployed, apply tags to subnets & security groups to enable discovery.

    ```txt
    karpenter.sh/discovery = <CLUSTER_NAME>
    ```

1. Next, apply a default Provisioner resource with sufficient maximum capacity to support your existing workloads.

1. Either cordon or apply taints to the existing nodes to prevent new pods from scheduling on the legacy node group.

    * If applying taints, use `effect: NoSchedule` to ensure you don't prematurely evict pods from the node.

1. Then scale the `cluster-autoscaler` deployment to 0 replicas using the kubectl scale command.

    ```shell
    kubectl scale deploy/cluster-autoscaler -n kube-system --replicas=0
    ```

1. Next, manually down scale the existing node group or ASG one node at a time, and watch as pods terminate and come online under new nodes provisioned by Karpenter.

1. Finally, leave a minimum of two (2) nodes present to support the Karpenter controller.
    * If you previously cordoned these nodes, you can un-cordon them now.
    * If you applied taints to the nodes, ensure the Karpenter controller deployment has a matching toleration.

> For detailed steps and the associated commands, follow the [Migrating from Cluster Autoscaler](https://karpenter.sh/v0.27.0/getting-started/migrating-from-cas/) in the public karpenter.sh documentation.

## Dos and Don'ts with Karpenter. Best practices etc

* **DO**: Leave a smaller scale managed node group with taints applied specifically for the Karpenter controller and apply tolerations on the Karpenter deployment.
* **DO**: When using spot instances, apply a variety of instance categories & CPU configurations in your Provisioner resource to ensure spot instance availability in the target availability zones.
* **DO**: Apply distinct Provisioner resources for spot & on-demand capacity types and use unique weight values to distribute workloads between both spot & on-demand in order of priority.
* **DON'T**: Provision more than one (1) security group to a node when using the AWS Load Balancer Controller ingress controller. Isolating specific security groups to nodes requires unique tagging for the associated AWSNodeTemplate discovery.
* **DON'T**: Pin too few instance types to a spot instance Provisioner resource. This can prohibit Karpenter from scaling when spot instance availability is low.
