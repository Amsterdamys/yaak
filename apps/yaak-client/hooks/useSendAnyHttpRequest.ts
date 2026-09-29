import type { HttpResponse } from "@yaakapp-internal/models";
import { flushAllModelWrites } from "@yaakapp-internal/models";
import { confirmWebProxy } from "../lib/confirmWebProxy";
import { runTestsAfterSend } from "../components/requestTests/runner";
import { rpc } from "../lib/rpc";
import { getActiveCookieJar } from "./useActiveCookieJar";
import { getActiveEnvironment } from "./useActiveEnvironment";
import { createFastMutation, useFastMutation } from "./useFastMutation";

async function sendAnyHttpRequestById(id: string | null): Promise<HttpResponse | null> {
  if (id == null) {
    return null;
  }

  if (!(await confirmWebProxy())) {
    return null;
  }

  await flushAllModelWrites();

  const response = await rpc<HttpResponse | null>("cmd_send_http_request", {
    requestId: id,
    environmentId: getActiveEnvironment()?.id,
    cookieJarId: getActiveCookieJar()?.id,
  });
  runTestsAfterSend(id, response); // [shaman] CORE-452: the request's Tests tab
  return response;
}

export function useSendAnyHttpRequest() {
  return useFastMutation<HttpResponse | null, string, string | null>({
    mutationKey: ["send_any_request"],
    mutationFn: sendAnyHttpRequestById,
  });
}

export const sendAnyHttpRequest = createFastMutation<HttpResponse | null, string, string | null>({
  mutationKey: ["send_any_request"],
  mutationFn: sendAnyHttpRequestById,
});
