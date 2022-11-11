import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { execSync } from 'child_process'

export class VPCStack extends Stack {
  vpc: ec2.Vpc
  securityGroup: ec2.SecurityGroup
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ],
    })
    this.vpc = vpc

    const securityGroup = new ec2.SecurityGroup(this, 'NATSecurityGroup', { vpc, allowAllOutbound: false })
    vpc.isolatedSubnets.forEach(({ ipv4CidrBlock }) => {
      securityGroup.addIngressRule(ec2.Peer.ipv4(ipv4CidrBlock), ec2.Port.tcp(80))
      securityGroup.addIngressRule(ec2.Peer.ipv4(ipv4CidrBlock), ec2.Port.tcp(443))
    })
    securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
    securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443))
    const instanceConnectCIDR = execSync(`curl -s https://ip-ranges.amazonaws.com/ip-ranges.json | jq -r '.prefixes[] | select(.region == "${this.region}" and .service == "EC2_INSTANCE_CONNECT") | .ip_prefix'`)
      .toString().trim()
    securityGroup.addIngressRule(ec2.Peer.ipv4(instanceConnectCIDR), ec2.Port.tcp(22))
    securityGroup.addIngressRule(securityGroup, ec2.Port.allTraffic())
    this.securityGroup = securityGroup

    const userData = ec2.UserData.forLinux({ shebang: 'Content-Type: multipart/mixed; boundary="//"' })
    userData.addCommands(
      'MIME-Version: 1.0',
      '',
      '--//',
      'Content-Type: text/cloud-config; charset="us-ascii"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      'Content-Disposition: attachment; filename="cloud-config.txt"',
      '',
      '#cloud-config',
      'cloud_final_modules:',
      '- [scripts-user, always]',
      '',
      '--//',
      'Content-Type: text/x-shellscript; charset="us-ascii"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      'Content-Disposition: attachment; filename="userdata.txt"',
      '',
      '#!/bin/bash',
      'sudo sysctl -w net.ipv4.ip_forward=1',
      'sudo /sbin/iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE',
      'sudo yum install iptables-services',
      'sudo service iptables save',
      '--//--',
    )
    vpc.isolatedSubnets.forEach(({ availabilityZone, routeTable: { routeTableId } }) => {
      const { instanceId } = new ec2.Instance(this, `NATGateway-${availabilityZone}`, {
        availabilityZone,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
        machineImage: ec2.MachineImage.latestAmazonLinux({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        securityGroup,
        sourceDestCheck: false,
        userData,
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      })
      new ec2.CfnRoute(this, `Route-${availabilityZone}`, {
        destinationCidrBlock: '0.0.0.0/0',
        instanceId,
        routeTableId,
      })
    })
  }
}
