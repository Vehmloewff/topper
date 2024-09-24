# Topper

An incomplete research project for an alternative to Apache Kafka.

A library for sending TCP messages between a client and multiple servers, here called the network. The network attains consensus on the
order of the messages, is fault proof, denial-of-service attack resistant, and capable of scaling infinitely.

## How it Works

Below is a simplified outline of the concepts used to achieve the above goals.

### Client

The client is pretty simple. It is given the addresses of 1+ servers. It pings the servers every 10 minutes, and establishes an ongoing
connection to the server with the lowest round-trip ping latency.

### Server

To maintain consensus, servers elect a leader for a particular topic, an channel all received messages to that server.

### DOS Attack Resistance

The client does not need to know the addresses of all the servers on the network, in fact, it shouldn't. It also shouldn't know which server
is the designated scope leader. This is to protect the servers from DOS attacks. It could cost the network a decent amount of inefficiency
if a leader
