import server from './index';

const instance = Bun.serve(server);

console.log(`Server listening on ${instance.protocol}://${instance.hostname}:${instance.port}`);

function shutdown() {
    instance.stop(true);
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
