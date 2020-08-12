const aws = require("https://github.com/PipedreamHQ/pipedream/components/aws/aws.app.js");
const axios = require("axios");

module.exports = {
  name: "SNS to Pipedream Subscription",
  description:
    "Creates an SNS topic in your AWS account. Messages published to this topic are emitted from the Pipedream source.",
  version: "0.0.1",
  dedupe: "unique", // Dedupe on SNS message ID
  props: {
    region: {
      label: "AWS Region",
      description:
        "The AWS region string where you'd like to create your SNS topic",
      type: "string",
      default: "us-east-1",
    },
    aws,
    http: "$.interface.http",
    db: "$.service.db",
    topic: {
      label: "SNS Topic Name",
      description:
        "**Pipedream will create an SNS topic with this name in your account**, converting it to a [valid SNS topic name](https://docs.aws.amazon.com/sns/latest/api/API_CreateTopic.html).",
      type: "string",
    },
  },
  methods: {
    convertNameToValidSNSTopicName(name) {
      // For valid names, see https://docs.aws.amazon.com/sns/latest/api/API_CreateTopic.html
      return name.replace(/[^a-zA-Z0-9_-]+/g, "-");
    },
  },
  hooks: {
    async activate() {
      const AWS = this.aws.sdk(this.region);
      const sns = new AWS.SNS();
      const topicName = this.convertNameToValidSNSTopicName(this.topic);
      console.log(`Creating SNS topic ${topicName}`);
      const topic = await sns.createTopic({ Name: topicName }).promise();
      this.db.set("topicARN", topic.TopicArn);
      console.log(
        `Subscribing this source's URL to SNS topic: ${this.http.endpoint}`
      );
      console.log(
        await sns
          .subscribe({
            TopicArn: topic.TopicArn,
            Protocol: "https",
            Endpoint: this.http.endpoint,
          })
          .promise()
      );
    },
    async deactivate() {
      const AWS = this.aws.sdk(this.region);
      const sns = new AWS.SNS();
      const TopicArn = this.db.get("topicARN");
      console.log(`Deleting SNS topic ${TopicArn}`);
      console.log(await sns.deleteTopic({ TopicArn }).promise());
    },
  },
  async run(event) {
    const { body, headers } = event;

    // Emit metadata
    const metadata = {
      summary: body.Subject || body.Message,
      id: headers["x-amz-sns-message-id"],
      ts: +new Date(body.Timestamp),
    };

    if (body.Type === "SubscriptionConfirmation") {
      console.log("Confirming SNS subscription");
      console.log(await axios({ url: body.SubscribeURL }));
    } else {
      try {
        this.$emit(JSON.parse(body.Message), metadata);
      } catch (err) {
        console.log(
          `Couldn't parse message as JSON. Emitting raw message. Error: ${err}`
        );
        this.$emit({ message: body.Message }, metadata);
      }
    }
  },
};