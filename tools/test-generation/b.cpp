#include <bits/stdc++.h>
using namespace std;
int main(){int n,x;scanf("%d %d",&n,&x);vector<int>c(n);for(auto&v:c)scanf("%d",&v);
 const long long M=1000000007;vector<long long>dp(x+1,0);dp[0]=1;
 for(int v:c)for(int s=v;s<=x;s++){dp[s]+=dp[s-v];if(dp[s]>=M)dp[s]-=M;}
 printf("%lld\n",dp[x]);}
