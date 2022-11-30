# Creating a Python Config Object using AWS Secrets Manager

Whether you’re developing your application to use Lambda functions, ECS or EKS containers, SageMaker Notebooks, or EC2 instances, the proper configuration management can make all the difference in the world in developer ergonomics, application security, and secrets management.

In this guide, we’ll walk through how to create a Python configuration class using AWS Secrets Manager and Python object inheritance. We’ll also demonstrate the use of our configuration object using AWS Lambda functions and the AWS Serverless Application Model CLI.

## Prerequisites

- [An AWS Account](https://aws.amazon.com/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS SAM (Serverless Application Model) CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [AWS Python SDK (Boto3)](https://aws.amazon.com/sdk-for-python/)
- Some experience with Python Development

## Architecture

<p align='center'>
  <img src='/docs/assets/images/python/secrets-manager-python-config.png'>
</p>

## Guide

### Create a Secret

In your AWS account, create a new secret in AWS Secrets Manager. We'll use a generic key/value secret for this example but any secret type could be applied so long as we use the proper Boto3 method to retrieve it. To create a generic secret using the AWS CLI, run the following command.

```shell
aws secretsmanager create-secret --name hello-world/stage --secret-string '{"DB_ENDPOINT": "mydb.example.com","DB_USERNAME": "mydbuser", "DB_PASSWORD": "supersecret"}'
```

This command creates a `hello-world/stage` secret and adds three key/value pairs for `DB_ENDPOINT`, `DB_USERNAME`, and `DB_PASSWORD`. Now that we have a secret created, let's create an app that uses it.

### Generate a Serverless App

SAM CLI offers boilerplate templates so we can get started developing quickly. To begin, run the following command in your preferred terminal to create a basic `hello-world` serverless application with Lambda and API Gateway.

```shell
sam init --name sam-app --runtime python3.9 --app-template hello-world --no-tracing
```

Using this command, SAM CLI has created a new directory with the name of our application. In this case, `sam-app`. Open this directory in your favorite integrated development environment (IDE). From your IDE's directory explorer tab, you can see SAM CLI generated a number of files and directories.

!!!note "directory structure"
    ```dir
    sam-app
    │   __init__.py
    │   .gitignore
    │   README.md
    │   template.yaml
    │
    └───events
    │   │   event.json
    │   │   file012.txt
    │   
    └───hello_world
        │   __init__.py
        │   app.py
        │   requirements.txt
    ```

Start by opening `template.yaml` and add two new parameters directly under the template description.

```yaml
Parameters:
  Environment:
    Type: String
    Default: local
  SecretName:
    Type: String
    Default: ""
```

We'll use the `Environment` parameter to tell us which config class we want to implement, and the `SecretName` to define which AWS Secrets Manager secret we want to use to source our credentials. Notice how we've passed an empty string to the `SecretName` parameter. We do this so that when invoking the function locally, we don't pass a null value to the environment variable we create.

It's important for our function to have the appropriate IAM policy, granting it permission to use our newly created secret. To do this, you let's add the appropriate IAM role & policy as CloudFormation resources to the `template.yaml`.

```yaml
  LambdaIAMExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument: {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "lambda.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        }
      Description: String
      ManagedPolicyArns: 
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  LambdaIAMExecutionRolePolicy:
    Type: AWS::IAM::Policy
    Properties:
      PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Action:
                - "secretsmanager:Get*"
                - "secretsmanager:List*"
                - "secretsmanager:Describe*"
                Effect: "Allow"
                Resource:
                  - !Sub arn:aws:secretsmanager:${!Ref "AWS::Region"}:${!Ref "AWS::AccountId" }:secret:hello-world/stage*
      PolicyName: !Sub "sam-app-demo-execution-policy-${Environment}"
      Roles:
        - !Ref LambdaIAMExecutionRole
```

With the new IAM role & policy resources, add a `Role` properties attribute to the `HelloWorldFunction` resource in our `template.yaml`.

```yaml
Role: !GetAtt LambdaIAMExecutionRole.Arn
```

Also replace the `Output` value referencing the `HelloWorldFunctionRole.Arn` with `LambdaIAMExecutionRole.Arn` as follows.

```yaml
Outputs:
  ...
  HelloWorldFunctionIamRole:
    Description: "Implicit IAM Role created for Hello World function"
    Value: !GetAtt LambdaIAMExecutionRole.Arn
```

While in the `template.yaml` file, look under the `Resources` block, in the `HelloWorldFunction`, we'll add an environment config using the two `Environment` & `SecretName` parameters we defined above. Place the following block somewhere within the `Resources.HelloWorldFunction.Properties` map.


```yaml
Environment:
  Variables:
    ENVIRONMENT: !Ref Environment
    SECRET_NAME: !Ref SecretName
```

Your `template.yaml` file should now look something like this.

!!!example
    ```yaml
    AWSTemplateFormatVersion: '2010-09-09'
    Transform: AWS::Serverless-2016-10-31
    Description: >
      sam-app

      Sample SAM Template for sam-app

    Parameters:
      Environment:
        Type: String
        Default: local
      SecretName:
        Type: String
        Default: ""

    # More info about Globals: https://github.com/awslabs/serverless-application-model/blob/master/docs/globals.rst
    Globals:
      Function:
        Timeout: 3

    Resources:
      HelloWorldFunction:
        Type: AWS::Serverless::Function # More info about Function Resource: https://github.com/awslabs/serverless-application-model/blob/master/versions/2016-10-31.md#awsserverlessfunction
        Properties:
          CodeUri: hello_world/
          Handler: app.lambda_handler
          Runtime: python3.9
          Role: !GetAtt LambdaIAMExecutionRole.Arn
          Architectures:
            - x86_64
          Environment:
            Variables:
              ENVIRONMENT: !Ref Environment
              SECRET_NAME: !Ref SecretName
          Events:
            HelloWorld:
              Type: Api # More info about API Event Source: https://github.com/awslabs/serverless-application-model/blob/master/versions/2016-10-31.md#api
              Properties:
                Path: /hello
                Method: get

      LambdaIAMExecutionRole:
        Type: AWS::IAM::Role
        Properties:
          AssumeRolePolicyDocument: {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {
                            "Service": "lambda.amazonaws.com"
                        },
                        "Action": "sts:AssumeRole"
                    }
                ]
            }
          Description: String
          ManagedPolicyArns: 
            - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      LambdaIAMExecutionRolePolicy:
        Type: AWS::IAM::Policy
        Properties:
          PolicyDocument:
                Version: "2012-10-17"
                Statement:
                  - Effect: "Allow"
                    Action:
                    - 'secretsmanager:Get*'
                    - 'secretsmanager:List*'
                    - 'secretsmanager:Describe*'
                    Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:hello-world/stage*'
          PolicyName: !Sub "sam-app-demo-execution-policy-${Environment}"
          Roles:
            - !Ref LambdaIAMExecutionRole


    Outputs:
      # ServerlessRestApi is an implicit API created out of Events key under Serverless::Function
      # Find out more about other implicit resources you can reference within SAM
      # https://github.com/awslabs/serverless-application-model/blob/master/docs/internals/generated_resources.rst#api
      HelloWorldApi:
        Description: "API Gateway endpoint URL for Prod stage for Hello World function"
        Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/hello/"
      HelloWorldFunction:
        Description: "Hello World Lambda Function ARN"
        Value: !GetAtt HelloWorldFunction.Arn
      HelloWorldFunctionIamRole:
        Description: "Implicit IAM Role created for Hello World function"
        Value: !GetAtt LambdaIAMExecutionRole.Arn
    ```

### Creating the Config Class

Next, we'll create a new file in the `hello_world` directory. Let's call this file `config.py`.

Open our new `config.py` file and add a few imports at the top of the file.

```python
import os
import logging
import json
import boto3
```

We'll use the `os` module to pull environment variables, the `logging` module to set global logging properties such as log level and format, the `json` module to load the string value of our secret as a Python dictionary, and the `boto3` module to create a Secrets Manager client for retrieving the secret.

Next, create a base `Config` class where we'll define a number of default values for our application. 

```python
class Config(object):
    def __init__(self):
        self.DB_ENDPOINT = os.getenv('DB_ENDPOINT', 'localhost')
        self.DB_USERNAME = os.getenv('DB_USERNAME', 'postgres')
        self.DB_PASSWORD = os.getenv('DB_PASSWORD', 'postgres')

        self.LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO'), logging.INFO)
        self.LOG_FORMAT = "%(levelname)s %(name)s %(message)s"
```

Each of these values pull from `os.getenv` and apply a default value should the key not exist. This is useful when running our application locally so that we can apply environment variables configs by passing an `env.json` file as a SAM CLI parameter. We'll discuss more on that later.

The next class we want to create is an `LocalConfig` class. This class will inherit the default values from our base `Config` class and overlay them with additional default customizations.

```python
class LocalConfig(Config):
    def __init__(self):
        super().__init__()

        self.LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'DEBUG'), logging.DEBUG)
```

Notice how we've added in Python's class inheritance method using `super().__init__()`. We won't go into details on the `super()` method in this document, but if you want to know more about it, you can read [Python's official documentation](https://docs.python.org/3/library/functions.html#super).

Lastly, we'll create our `EnvironmentConfig` class, once again, extending the base `Config` class to inherit our default values.

```python
class EnvironmentConfig(Config):
    def __init__(self):
        super().__init__()

        client = boto3.client('secretsmanager', region_name="us-east-1")
        secret = json.loads(client.get_secret_value(SecretId=os.getenv('SECRET_NAME'))['SecretString'])

        for key, value in secret.items():
            setattr(self, key, value)
```

As you can see, in this class, we've created a `boto3.client` connection to Secrets Manager and loaded the secret value as a dictionary object using `json.loads`. Once we have the secret, we use Python's built-in `setattr` method to apply each key/value pair from the secret to our class object. Any keys that were defined by default in the base `Config` class will now be overwritten in the `EnvironmentConfig` class.

Before we're done in the `config.py` file, we'll add one more dictionary object to differentiate between environment classes. This dictionary object will use the `Environment` parameter we added to the template previously and reference the proper config class we wish to use for that particular environment.

```python
config = {
    'local': LocalConfig,
    'stage': EnvironmentConfig,
    'prod': EnvironmentConfig,
    'default': LocalConfig
}
```

When complete, the `config.py` should look like this.

!!!example
    ```python
    import os
    import logging
    import json
    import boto3


    class Config(object):
        def __init__(self):
            self.DB_ENDPOINT = os.getenv('DB_ENDPOINT', 'localhost')
            self.DB_USERNAME = os.getenv('DB_USERNAME', 'postgres')
            self.DB_PASSWORD = os.getenv('DB_PASSWORD', 'postgres')

            self.LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO'), logging.INFO)
            self.LOG_FORMAT = "%(levelname)s %(name)s %(message)s"


    class LocalConfig(Config):
        def __init__(self):
            super().__init__()

            self.LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'DEBUG'), logging.DEBUG)


    class EnvironmentConfig(Config):
        def __init__(self):
            super().__init__()

            client = boto3.client('secretsmanager', region_name="us-east-1")
            secret = json.loads(client.get_secret_value(SecretId=os.getenv('SECRET_NAME'))['SecretString'])

            for key, value in secret.items():
                setattr(self, key, value)



    config = {
        'local': LocalConfig,
        'stage': EnvironmentConfig,
        'prod': EnvironmentConfig,
        'default': LocalConfig
    }
    ```

### Using the Config Class

Finally, we want to use our newly minted configuration classes in the app. To do so, open the `app.py` file in the `hello_world` directory and import the dictionary object we just created along with the `os` module.

```python
import os
from config import config
```

To differentiate between environments, create a new `environment` string object by getting the `ENVIRONMENT` env var from `os` using 'default' as the default value.

```python
environment = os.getenv('ENVIRONMENT', 'default')
```

Now we're finally ready to instantiate and use the config classes as a new object. Instantiate the config classes by passing the `environment` string object from above as the key.

```python
config = config[environment]()
```

We now have our `config` object created and ready to use both default and secrets attributes.

### Demonstration

Let's now add a log statement of the Lambda handler to demonstrate our configs.

!!!warning "Please do not log or return any secret values in a deployed application. This is only for demonstration purposes."

Add a `logging` import at the top of `app.py` and create an info log and a debug log statement inside the `lambda_handler` function. You will also want to set the root logger for your application to use the `config.LOG_LEVEL` and `config.LOG_FORMAT` attributes we configured earlier.

```python
logging.root.handlers = []
logging.basicConfig(level=config.LOG_LEVEL, format=config.LOG_FORMAT)
```

Let's also add some logging statements to reflect the config differences between environments. Within the lambda handler, between the `logging.basicConfig` and the `return` statement, add the following lines.

```python
logging.info(config.DB_ENDPOINT)
logging.debug(config.DB_USERNAME)
```

By now, your `app.py` should look something like this.

!!!example
    ```python
    import json
    import os
    import logging

    from config import config

    environment = os.getenv('ENVIRONMENT', 'default')
    config = config[environment]()


    def lambda_handler(event, context):
        logging.root.handlers = []
        logging.basicConfig(level=config.LOG_LEVEL, format=config.LOG_FORMAT)

        logging.info(config.DB_ENDPOINT)
        logging.debug(config.DB_USERNAME)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "hello world"
            }),
        }
    ```

### Local Testing

We can now start the application using SAM CLI. Make sure you have Docker daemon running (open Docker Desktop) and run the following commands to start a local environment.

```shell
sam build
sam local start-api
```

As mentioned before, you can set local environment variables for use with SAM CLI by creating an `env.json` file and adding the `--env-vars` parameter to the `start-api` command. 

The `env.json` should look something like this.

```json
{
    "Parameters": {
        "DB_ENDPOINT": "host.docker.internal",
        "DB_USERNAME": "postgres",
        "DB_PASSWORD": "postgres",
        "LOG_LEVEL": "DEBUG"
    }
}
```

The command would now be as follows

```shell
sam local start-api --env-vars env.json
```

Once the application starts, open a browser to `http://127.0.0.1:3000/hello` and look through the logs in the terminal where you started the API. You should see two statements, both returning the default values we set in the base Config class.

```txt
INFO root host.docker.internal
DEBUG root postgres
```

Now edit the `env.json` to reflect `localhost` and `localuser` for the respective values and restart the local API. Notice the difference in the logs?

### :rocket: Deploy the Function

Finally, lets deploy the app and see how it differs when pulling our config secrets from Secrets Manager. For the demo, we'll deploy the app from command line.

!!!note "If you're deploying a production SAM application, it's recommended to set up a SAM deployment pipeline using your preferred CI/CD platform."

```shell
sam deploy --stack-name sam-app-demo --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides SecretName=hello-world/stage Environment=stage
```

Look in the outputs from the deployment command for the value of `HelloWorldApi` and open the link in your browser. It should return with the `{"message": "hello world"}` response as configured in the function return statement.

Now open CloudWatch Logs from the AWS Console and find the latest log event for our Lambda function. You should notice in the logs that the debug statement is missing since we didn't overwrite the `LOG_LEVEL` from our base configuration class. The info log returned, however, reflects the value we placed in our secret as follows.

```txt
INFO root mydb.example.com
```

Want to see debug logs? Those can be set in one of two places. Either in the secret itself or in an environment variable on the Lambda function. Why? Because we configured our base `Config` class to get the proper logging attribute from the `LOG_LEVEL` environment variable.

```python
self.LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO'), logging.INFO)
```

That said leads to the following conclusion. You can define any configuration property and key you want in a Secrets Manager secret. Anything you want defined in an environment variable should be declared in the base `Config` class.

## Conclusion

AWS Secrets Manager, when used with Python class object inheritance, can be a secure and easy method of managing your environment configs. It's a key component to maintaining secure coding practices across local development and live environments.
