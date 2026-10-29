#include <bits/stdc++.h>
using namespace std;
int main(){int n;long long x;scanf("%d %lld",&n,&x);vector<long long>w(n);for(auto&v:w)scanf("%lld",&v);
 vector<pair<int,long long>>dp(1<<n,{INT_MAX,0});dp[0]={1,0};
 for(int m=1;m<(1<<n);m++)for(int i=0;i<n;i++)if(m>>i&1){auto p=dp[m^(1<<i)];
  if(p.second+w[i]<=x)p.second+=w[i];else{p.first++;p.second=w[i];}dp[m]=min(dp[m],p);}
 printf("%d\n",dp[(1<<n)-1].first);}
