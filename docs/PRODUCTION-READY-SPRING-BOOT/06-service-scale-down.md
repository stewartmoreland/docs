# Part 6: Scaling &darr;DOWN Spring Boot Applications

By now, everyone is likely aware that Kubernetes deployments are ephemeral in nature. They can be scaled up to meet demand and scaled down when traffic to the service decreases. Scaling up to meet demand means maintaining a level of application responsiveness. It seems rather obvious how Kubernetes would handle starting new pods when an up scaling event occurs since it's not unlike starting the application to begin with.

But what about scaling down? What happens when an [HPA](/platform/kubernetes/hpa) or [KEDA ScaledObject](/platform/kubernetes/keda#ScaledObjects) decides that the demand for the service has dropped sufficiently and the service can be scaled down?

## Kubernetes Behavior

In said scenario Kubernetes sends two events to the container. Those events are known as `SIGTERM` and `SIGKILL`. As you can probably see by the name of these events, the `SIGTERM` signal tells the container it needs to shut down or start terminating it's connections. Kubernetes then waits for a specified grace period (default 30 seconds) and sends the `SIGKILL` signal, forcing the application to stop and terminating the pod.

## Spring Behavior

"Great! Thirty (30) seconds should be more than enough time for our connections to close cleanly." But wait... how does Spring handle these events?

By default, when Spring receives a `SIGTERM` signal, it is configured to **immediately** halt traffic and close connections. When doing so, it responds to the client with a `503` HTTP status code. Most client connections should be configured to handle this and retry the request, but not all. So how can we prevent Spring from terminating connections and allow them to close gracefully?

### Graceful Spring Terminations

Spring implements two embedded web server configurations, Tomcat and Jetty. Both embedded web servers support a configuration parameter to gracefully shut down and terminate connections which can be configured in the service's application properties.

!!!example "application.yaml"
    ```yaml
    server:
      shutdown: graceful
    ```

-**OR**-

!!!example "application.properties"
    ```ini
    server.shutdown=graceful
    ```

Helpful, right? In this configuration, Spring still sends `503` responses to new connections but allows existing connections up to 30 seconds to close gracefully before terminating them, as does Kubernetes.

### Give Spring More Time To Close

But not all services are created equal and some require more time to close. We may want more than 30 seconds to finish processing the request. This can be configured in two places. First in Spring, we can set the property `spring.lifecycle.timeout-per-shutdown-phase`. The value for this property should be set in string format.

!!!example "application.yaml"
    ```yaml
    spring:
      lifecycle:
        timeout-per-shutdown-phase: 1m
    ```

-**OR**-

!!!example "application.properties"
    ```ini
    spring.lifecycle.timeout-per-shutdown-phase=1m
    ```

In both of these examples, we've configured Spring to allow up to 1 minute for connections to close gracefully. But Kubernetes is still configured to terminate after 30 seconds. In the `deployment.yaml`, we're going to create another property called `terminationGracePeriodSeconds` under the pod spec. I'll highlight the levels of the `deployment.yaml` below.

!!!example "deployment.yaml"
    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: nginx-deployment
      labels:
        app: nginx
    spec:                           ## 1st spec: Replication Group Configs
      replicas: 3
      selector:
        matchLabels:
          app: nginx
      template:
        metadata:
          labels:
            app: nginx
        spec:                       ## 2nd spec: Pod Configurations
          containers:
          - name: nginx
            image: nginx:1.14.2
            ports:
            - containerPort: 80
    ```

Under the 2nd pod configuration spec is where we'll place the `terminationGracePeriodSeconds` property to allow 1 minute for the application to terminate its connections.

!!!example
    ```yaml
    ...
    spec:
      replicas: 3
      ...
      template:
        ...
        spec:
          terminationGracePeriodSeconds: 60
          containers:
            ...
    ```

## Conclusion

And that's it! Your application is ready to terminate with grace. Time to ship it to prod :rocket: and relax :beach_with_umbrella:.

Simple enough configuration properties. The hardest part for me was finding out what was happening behind the scenes. :sweat_smile:

## Reference Articles

| Function |
|----------|
|[Kubernetes Best Practices: Terminating With Grace](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace){target=_blank}|
|[Spring Boot Web Server Shutdown](https://www.baeldung.com/spring-boot-web-server-shutdown){target=_blank}|
