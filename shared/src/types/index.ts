export * from "./category";

export interface ApiResponse<T = unknown> {
  status: number;
  message: string;
  data?: T;
  error?: string;
}


export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination? :{
    page:number,
    limit:number,
    total:number
  }
}