import type {BaseType} from "./baseType";

export interface Category extends BaseType {
    name: string,
    description: string,
    parent_id: number | null,
}


export interface CategoryRequest {
    name: string,
    description?: string,
    parent_id?: number | null,
}

export interface CategoryResponse {
    id: string,
    name: string,
    description: string,
    parent_id: string | null,
    parent_name?: string,
    children_count: number,
    created_at: string,
    updated_at: string,
}

export interface CategoryTreeNode extends CategoryResponse {
    children: CategoryTreeNode[],
}
