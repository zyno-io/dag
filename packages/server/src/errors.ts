export class JobTokenVerificationError extends Error {
    constructor(message = 'Job token verification failed') {
        super(message);
        this.name = 'JobTokenVerificationError';
    }
}
