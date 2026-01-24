import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import beaver from "@/assets/beaver.svg";
import type { ApiResponse } from "shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: Index,
});

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

function Index() {
  const [data, setData] = useState<ApiResponse | undefined>();

  const { mutate: sendRequest } = useMutation({
    mutationFn: async () => {
      try {
        const req = await fetch(`${SERVER_URL}/hello`);
        const res: ApiResponse = await req.json();
        setData(res);
      } catch (error) {
        console.log(error);
      }
    },
  });

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 items-center justify-center min-h-screen p-6">
      <a
        href="https://github.com/stevedylandev/bhvr"
        target="_blank"
        rel="noopener"
      >
        <img
          src={beaver}
          className="w-16 h-16 cursor-pointer"
          alt="beaver logo"
        />
      </a>
      <h1 className="text-5xl font-black">bhvr</h1>
      <h2 className="text-2xl font-bold">Bun + Hono + Vite + React</h2>
      <p>A typesafe fullstack monorepo</p>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mt-8">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary">
          <Link to="/categories" className="block p-6">
            <CardHeader className="p-0">
              <CardTitle className="text-2xl mb-2">Categories</CardTitle>
              <CardDescription className="text-base">
                Manage product categories and organize your inventory
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 opacity-50">
          <div className="block p-6">
            <CardHeader className="p-0">
              <CardTitle className="text-2xl mb-2">Products</CardTitle>
              <CardDescription className="text-base">
                Coming soon - Manage your product catalog
              </CardDescription>
            </CardHeader>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-4 mt-4">
        <Button onClick={() => sendRequest()}>Call API</Button>
        <Button variant="secondary" asChild>
          <a target="_blank" href="https://bhvr.dev" rel="noopener">
            Docs
          </a>
        </Button>
      </div>
      {data && (
        <pre className="bg-gray-100 p-4 rounded-md">
          <code>
            Message: {data.message} <br />
            Success: {data.success.toString()}
          </code>
        </pre>
      )}
    </div>
  );
}

export default Index;
