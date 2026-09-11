export class CrmError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrmError'
  }
}

export function die(msg: string): never {
  throw new CrmError(msg)
}
