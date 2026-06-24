type SendFn = (event: string, data: object) => Promise<void>;
const registry = new Map<number, Set<SendFn>>();

export function addConnection(userId: number, fn: SendFn): void {
    if (!registry.has(userId)) registry.set(userId, new Set());
    registry.get(userId)!.add(fn);
}

export function removeConnection(userId: number, fn: SendFn): void {
    registry.get(userId)?.delete(fn);
    if (registry.get(userId)?.size === 0) registry.delete(userId);
}

export function pushToUser(userId: number, event: string, data: object): void {
    registry.get(userId)?.forEach((fn) => fn(event, data).catch(() => {}));
}

export function pushToMany(userIds: number[], event: string, data: object): void {
    userIds.forEach((id) => pushToUser(id, event, data));
}
