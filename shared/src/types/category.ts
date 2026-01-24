import type {BaseType} from "./baseType";

export interface Category extends BaseType {
    name: string,
    description: string,
}


export interface CategoryRequest {
    name: string,
    description: string,
}

export interface CategoryResponse {
    id: string,
    name: string,
    description: string,
    created_at: string,
    updated_at: string,
}