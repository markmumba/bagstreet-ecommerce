
export class AppError extends Error {
    constructor(
        public statusCode: number,
        message:string,
        public code?:string
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends AppError {
    constructor(resource:string,identifier?:string|number) {
        super (
            404,
            identifier? `${resource} with identifier '${identifier}' not found` : `${resource} not found`,
            'NOT_FOUND'
        );
    }
}


export class ValidationError extends AppError {
  constructor(message: string, public errors?: any) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}